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
        generator(host, { ...options, envs: 'test-dev test-dev' })
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
      expect(host.exists('.openshift/environment.infra.yml')).toBeTruthy();
      expect(host.exists('.openshift/environments.yml')).toBeTruthy();
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
      expect(host.exists('.openshift/github-runner/deployment.yml')).toBeTruthy();
      const dep = host.read('.openshift/github-runner/deployment.yml').toString();
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
        generator(host, { ...options, envs: 'test-dev test-dev' })
      ).rejects.toThrow('Each environment must be a unique project.');
    });
  });
});
