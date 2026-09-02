import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { readFileSync } from 'fs';
import { join } from 'path';
import pipelineGenerator from '../../generators/pipeline/pipeline';
import migration from './split-pipeline-workflows';

const PIPELINE_PATH = '.github/workflows/pipeline.yml';
const PR_PATH = '.github/workflows/pull-request.yml';

const headBefore = readFileSync(
  join(__dirname, 'pipeline-head.before.txt'),
  'utf-8',
);
const headAfter = readFileSync(
  join(__dirname, 'pipeline-head.after.txt'),
  'utf-8',
);

// Builds a faithful pre-split workflow by generating the current (already split)
// one and swapping its head region back to the pre-split shape — so the
// interpolated parts around the region (the environment comment list, registry,
// namespaces, deploy jobs) are real generator output rather than a hand-written
// approximation of it.
async function treeWithPreSplitPipeline(): Promise<Tree> {
  const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  await pipelineGenerator(host, {
    pipeline: 'test',
    registry: 'ghcr.io/test-org',
    type: 'actions',
    infra: 'test-infra',
    envs: 'test-dev test-test test-prod',
  });

  const split = host.read(PIPELINE_PATH).toString();
  expect(split).toContain(headAfter);
  host.write(PIPELINE_PATH, split.replace(headAfter, headBefore));
  host.delete(PR_PATH);
  return host;
}

describe('split-pipeline-workflows migration', () => {
  it('splits the check job into its own workflow', async () => {
    const host = await treeWithPreSplitPipeline();

    await migration(host);

    const pr = host.read(PR_PATH).toString();
    expect(pr).toContain('name: Pull Request Check');
    expect(pr).toContain('pull_request:');
    // Job name is preserved so an existing required status check keeps resolving.
    expect(pr).toContain('check:');
    expect(pr).toContain('cancel-in-progress: true');
    // Security scanners are PR-gate concerns and travel with the check job.
    expect(pr).toContain('trufflesecurity/trufflehog');
    expect(pr).toContain('hadolint/hadolint-action');
    // The check needs no credentials at all — that's the point of the split.
    expect(pr).not.toContain('OPENSHIFT_SERVER');
    expect(pr).not.toContain('ghcr.io/test-org');
  });

  it('narrows the pipeline workflow to the deploy half, queued not cancelled', async () => {
    const host = await treeWithPreSplitPipeline();

    await migration(host);

    const pipeline = host.read(PIPELINE_PATH).toString();
    expect(pipeline).not.toContain('  check:');
    expect(pipeline).not.toContain('pull_request');
    expect(pipeline).not.toContain('cancel-in-progress: true');
    expect(pipeline).toContain('cancel-in-progress: false');
    // The guard is redundant once the workflow no longer sees the event.
    expect(pipeline).not.toContain("github.event_name != 'pull_request'");
  });

  it('leaves the interpolated deploy half untouched', async () => {
    const host = await treeWithPreSplitPipeline();
    const before = host.read(PIPELINE_PATH).toString();
    const deployHalf = before.slice(before.indexOf('      - run: npm prune'));

    await migration(host);

    const after = host.read(PIPELINE_PATH).toString();
    expect(after).toContain(deployHalf);
    // Spot-check the parts a bad splice would most plausibly damage.
    expect(after).toContain('ghcr.io/test-org');
    expect(after).toContain('test-infra');
    expect(after).toContain('needs: [build, deployTest]');
    expect(after).toContain('[self-hosted, playwright]');
  });

  it('reports nothing to do when there is no generated pipeline', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });

    await expect(migration(host)).resolves.toBeUndefined();
    expect(host.exists(PR_PATH)).toBeFalsy();
  });

  it('is a no-op on an already-split workflow', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
    await pipelineGenerator(host, {
      pipeline: 'test',
      registry: 'ghcr.io/test-org',
      type: 'actions',
      infra: 'test-infra',
      envs: 'test-dev',
    });
    const pipeline = host.read(PIPELINE_PATH).toString();
    const pr = host.read(PR_PATH).toString();

    await expect(migration(host)).resolves.toBeUndefined();

    expect(host.read(PIPELINE_PATH).toString()).toEqual(pipeline);
    expect(host.read(PR_PATH).toString()).toEqual(pr);
  });

  it('warns and skips a customised workflow rather than pattern-editing it', async () => {
    const host = await treeWithPreSplitPipeline();
    host.write(
      PIPELINE_PATH,
      host
        .read(PIPELINE_PATH)
        .toString()
        .replace('timeout-minutes: 15', 'timeout-minutes: 45'),
    );
    const original = host.read(PIPELINE_PATH).toString();

    const report = await migration(host);

    expect(host.read(PIPELINE_PATH).toString()).toEqual(original);
    expect(host.exists(PR_PATH)).toBeFalsy();
    expect(report.nextSteps[0]).toContain(PIPELINE_PATH);
    expect(report.agentContext[0]).toContain('needs splitting by hand');
  });

  it('never overwrites a pull-request.yml it did not write', async () => {
    const host = await treeWithPreSplitPipeline();
    host.write(PR_PATH, 'name: Hand written\n');
    const original = host.read(PIPELINE_PATH).toString();

    const report = await migration(host);

    expect(host.read(PR_PATH).toString()).toEqual('name: Hand written\n');
    expect(host.read(PIPELINE_PATH).toString()).toEqual(original);
    expect(report.nextSteps[0]).toContain('checked twice');
  });
});
