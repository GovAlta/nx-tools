import {
  Tree,
} from '@nrwl/devkit';
import { runOcCommand } from '../../utils/oc-utils';

function applyOcResources(host: Tree) {

  const { success: pipelineApplied } = runOcCommand(
    'apply', 
    [],
    host.read('.openshift/environment.infra.yml')
  );
  
  const { success: envApplied } = runOcCommand(
    'apply', 
    [],
    host.read('.openshift/environment.dev.yml')
  );

  if (!pipelineApplied || !envApplied) {
    console.log('Failed to oc apply pipeline and dev environment.');
  }
}

export default async function (host: Tree) {
  const { success } = runOcCommand('project', []);
  if (success) {
    applyOcResources(host);
  } else {
    console.log(`Use oc login then run 'nx g @abgov/nx-oc:apply-infra'`);
  }
}
