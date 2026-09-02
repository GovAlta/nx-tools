import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Schema } from './schema';
import generator from './pipeline';

describe('Pipeline Generator', () => {
  describe('Jenkins', () => {
    const options: Schema = {
      pipeline: 'test',
      registry: 'ghcr.io/test-org',
      type: 'jenkins',
      infra: 'test-infra',
      envs: 'test-dev',
    };

    it('can run', async () => {
      const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
      await generator(host, options);
      expect(host.exists('.openshift/Jenkinsfile')).toBeTruthy();
      expect(host.exists('.openshift/environment.infra.yml')).toBeTruthy();
      expect(host.exists('.openshift/environments.yml')).toBeTruthy();
      // The Actions workflows belong to the actions path only.
      expect(host.exists('.github/workflows/pull-request.yml')).toBeFalsy();
    });

    it('can generate multiple envs', async () => {
      const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
      await generator(host, { ...options, envs: 'test-dev test-test' });
      expect(host.exists('.openshift/environments.yml')).toBeTruthy();

      const envs = host.read('.openshift/environments.yml').toString();
      expect(envs).toContain('test-dev');
      expect(envs).toContain('test-test');
    });

    it('can fail for duplicate env project', async () => {
      const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
      await expect(
        generator(host, { ...options, envs: 'test-dev test-dev' }),
      ).rejects.toThrow('Each environment must be a unique project.');
    });
  });

  describe('GitHub Actions', () => {
    const options: Schema = {
      pipeline: 'test',
      registry: 'ghcr.io/test-org',
      type: 'actions',
      infra: 'test-infra',
      envs: 'test-dev',
    };

    it('can run', async () => {
      const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
      await generator(host, options);
      expect(host.exists('.github/workflows/pipeline.yml')).toBeTruthy();
      expect(host.exists('.github/workflows/pull-request.yml')).toBeTruthy();
      expect(host.exists('.openshift/environment.infra.yml')).toBeTruthy();
      expect(host.exists('.openshift/environments.yml')).toBeTruthy();
    });

    // The PR check and the deploy chain are separate workflows because one
    // workflow carries one `concurrency` block and the two halves need opposite
    // policies: cancel a superseded check, queue an in-flight deploy.
    it('checks pull requests in a credential-free workflow of its own', async () => {
      const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
      await generator(host, options);

      const pr = host.read('.github/workflows/pull-request.yml').toString();
      expect(pr).toContain('name: Pull Request Check');
      expect(pr).toContain('pull_request:');
      expect(pr).toContain('cancel-in-progress: true');
      // Job name is "check" so a required status check set on the pre-split
      // workflow keeps resolving after the split.
      expect(pr).toContain('check:');
      expect(pr).toContain('trufflesecurity/trufflehog');
      expect(pr).toContain('hadolint/hadolint-action');
      // Nothing here reaches OpenShift or a registry, so it needs no secrets.
      expect(pr).not.toContain('OPENSHIFT_SERVER');
      expect(pr).not.toContain('ghcr.io/test-org');
      expect(pr).not.toContain('buildah');
    });

    it('never cancels an in-flight deploy, and does not run on pull requests', async () => {
      const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
      await generator(host, options);

      const workflow = host.read('.github/workflows/pipeline.yml').toString();
      // Cancelling mid-chain can leave a Deployment on `oc set triggers --auto`,
      // and loses a pending environment approval.
      expect(workflow).toContain('cancel-in-progress: false');
      expect(workflow).not.toContain('pull_request');
      expect(workflow).not.toContain('  check:');
      expect(workflow).not.toContain('trufflesecurity/trufflehog');
    });

    it('includes registry in pipeline workflow', async () => {
      const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
      await generator(host, options);
      const workflow = host.read('.github/workflows/pipeline.yml').toString();
      expect(workflow).toContain('ghcr.io/test-org');
      expect(workflow).toContain('buildah build');
      expect(workflow).toContain('oc import-image');
      expect(workflow).toContain('oc set triggers');
    });

    it('adds a deployed-env Playwright e2e job + the self-hosted runner manifest', async () => {
      const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
      await generator(host, options);

      const workflow = host.read('.github/workflows/pipeline.yml').toString();
      // e2e runs on the in-cluster self-hosted runner, gated so it can't queue
      // before the runner exists, resolves the deployed URL, and is report-style.
      expect(workflow).toContain('[self-hosted, playwright]');
      expect(workflow).toContain("vars.RUN_E2E == 'true'");
      expect(workflow).toContain('oc get route');
      expect(workflow).toContain('BASE_URL=');
      // --exclude-task-dependencies skips nx's inferred serve dependency so no
      // local server runs when targeting the deployed URL.
      expect(workflow).toContain('nx e2e "$e2e" --exclude-task-dependencies');

      // Runner provisioning ships as in-repo manifests referencing the shared
      // public image (no per-repo build, no pull secret).
      expect(
        host.exists('.openshift/github-runner/deployment.yml'),
      ).toBeTruthy();
      const dep = host
        .read('.openshift/github-runner/deployment.yml')
        .toString();
      expect(dep).toContain('ghcr.io/govalta/github-runner-playwright');
      expect(dep).toContain('RUNNER_LABELS');
      expect(dep).toContain('test-infra'); // namespace = the infra project
      expect(host.exists('.openshift/github-runner/README.md')).toBeTruthy();
    });

    it('can generate multiple envs', async () => {
      const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
      await generator(host, { ...options, envs: 'test-dev test-test' });
      expect(host.exists('.openshift/environments.yml')).toBeTruthy();

      const envs = host.read('.openshift/environments.yml').toString();
      expect(envs).toContain('test-dev');
      expect(envs).toContain('test-test');
    });

    it('can fail for duplicate env project', async () => {
      const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
      await expect(
        generator(host, { ...options, envs: 'test-dev test-dev' }),
      ).rejects.toThrow('Each environment must be a unique project.');
    });
  });
});
