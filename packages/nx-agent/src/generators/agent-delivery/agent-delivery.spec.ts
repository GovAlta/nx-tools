import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import generator from './agent-delivery';

const SKILL_PATHS = [
  '.claude/skills/discover/SKILL.md',
  '.claude/skills/design/SKILL.md',
  '.claude/skills/develop/SKILL.md',
  '.claude/skills/deploy/SKILL.md',
];

const GITHUB_ACTIONS_PATHS = [
  'scripts/run-agent-delivery-iteration.sh',
  'scripts/register-mcp-servers.sh',
  'scripts/ensure-completion-pr.sh',
  'scripts/dispatch-next-iteration.sh',
  'scripts/task-identification.mjs',
  '.github/workflows/agent-delivery-iteration.yml',
  '.github/agent-delivery-iteration/learnings.md',
];

describe('nx-agent agent-delivery generator', () => {
  let host: Tree;

  beforeEach(() => {
    host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  it('writes the four skill files, the base gate script, and the AGENTS.md section', async () => {
    await generator(host, {});

    for (const path of SKILL_PATHS) {
      expect(host.exists(path)).toBeTruthy();
    }
    expect(host.exists('scripts/check-example-mapping.mjs')).toBeTruthy();

    const agents = host.read('AGENTS.md').toString();
    expect(agents).toContain('## DDDD workflow');
    expect(agents).toContain('.claude/skills/discover/SKILL.md');

    const pkg = JSON.parse(host.read('package.json').toString());
    expect(pkg.devDependencies.yaml).toBeTruthy();
  });

  it('does not write any --githubActions-only file by default', async () => {
    await generator(host, {});

    for (const path of GITHUB_ACTIONS_PATHS) {
      expect(host.exists(path)).toBe(false);
    }
  });

  it('--githubActions additionally writes the harness scripts, workflow, and learnings header', async () => {
    await generator(host, { githubActions: true });

    for (const path of GITHUB_ACTIONS_PATHS) {
      expect(host.exists(path)).toBeTruthy();
    }

    // Real, dated entries from the reference repo's own trial-run history must
    // never ship as template content — only the file's own explanatory header.
    const learnings = host
      .read('.github/agent-delivery-iteration/learnings.md')
      .toString();
    expect(learnings).toContain('Bar for adding an entry');
    expect(learnings).not.toMatch(/^## \d{4}-\d{2}-\d{2}/m);

    const workflow = host
      .read('.github/workflows/agent-delivery-iteration.yml')
      .toString();
    // The namespace must be parameterized, not hardcoded to the reference
    // repo's own sandbox project.
    expect(workflow).toContain('${{ vars.OPENSHIFT_NAMESPACE }}');
    expect(workflow).not.toContain('ui-components-build');
    // Scripts are invoked via an explicit interpreter, not direct execution —
    // host.write() never sets the executable bit, so a bare `./scripts/x.sh`
    // would fail with "permission denied" once actually run in CI.
    expect(workflow).not.toMatch(/run: \.\/scripts\//);

    const taskIdentification = host
      .read('scripts/task-identification.mjs')
      .toString();
    // An environment-specific assumption from the reference repo's own CI
    // runner (route unreachable from that runner) must not ship as if it
    // were universally true.
    expect(taskIdentification).not.toContain('is not. If you reach Deploy');
  });

  it('task-identification does not write history.json when no signals exist', async () => {
    await generator(host, { githubActions: true });

    const script = host.read('scripts/task-identification.mjs').toString();
    const tmpDir = mkdtempSync(join(tmpdir(), 'nx-agent-task-id-test-'));
    try {
      writeFileSync(join(tmpDir, 'task-identification.mjs'), script);
      symlinkSync(join(process.cwd(), 'node_modules'), join(tmpDir, 'node_modules'));

      mkdirSync(join(tmpDir, '.nx-agent'));
      writeFileSync(
        join(tmpDir, '.nx-agent', 'lineage.json'),
        JSON.stringify({
          registry: {},
          index: {},
          violations: {
            brokenRefs: [],
            unscoped: [],
            orphans: [],
            resolutionStatus: { open: [], resolved: [] },
          },
        }),
      );

      const outputFile = join(tmpDir, 'github-output');
      writeFileSync(outputFile, '');
      execSync('node task-identification.mjs', {
        cwd: tmpDir,
        env: { ...process.env, GITHUB_OUTPUT: outputFile, GITHUB_REF_NAME: 'feature/test' },
      });

      expect(
        existsSync(join(tmpDir, '.github', 'agent-delivery-iteration', 'history.json')),
      ).toBe(false);
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it('never overwrites a file a team has already edited', async () => {
    await generator(host, { githubActions: true });

    const customized = '# Discover (customized)\n\nOur own house rules.\n';
    host.write('.claude/skills/discover/SKILL.md', customized);

    await generator(host, { githubActions: true });

    expect(host.read('.claude/skills/discover/SKILL.md').toString()).toBe(
      customized,
    );
  });

  it('re-running does not duplicate the AGENTS.md section', async () => {
    await generator(host, {});
    await generator(host, {});

    const agents = host.read('AGENTS.md').toString();
    expect(agents.split('## DDDD workflow').length - 1).toBe(1);
  });
});
