import { Tree } from '@nx/devkit';
import { ensureOcLogin, runOcCommand } from '../../utils/oc-utils';

function applyOcResources(host: Tree) {
  const { success: pipelineApplied, stdout: pipelineOut } = runOcCommand(
    'apply',
    [],
    host.read('.openshift/environment.infra.yml')
  );
  console.log(pipelineOut?.toString());

  const { success: envApplied, stdout: envOut } = runOcCommand(
    'apply',
    [],
    host.read('.openshift/environments.yml')
  );
  console.log(envOut?.toString());

  if (!pipelineApplied || !envApplied) {
    console.log('Failed to oc apply pipeline and dev environment.');
  }
}

export default async function (host: Tree) {
  ensureOcLogin();
  applyOcResources(host);
}
