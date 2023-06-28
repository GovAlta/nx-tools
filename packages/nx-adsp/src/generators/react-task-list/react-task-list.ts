import {
  environments,
  getServiceUrls,
  realmLogin,
  selectTenant,
} from '@abgov/nx-oc';
import {
  Tree,
  formatFiles,
  generateFiles,
  getWorkspaceLayout,
  names,
} from '@nrwl/devkit';
import axios from 'axios';
import { prompt } from 'enquirer';
import * as path from 'path';
import { NormalizedSchema, Schema } from './schema';
import { QueueDefinition } from '../../utils/task';

async function getQueueDefinition(
  configurationServiceUrl: string,
  token: string
): Promise<{ queueDefinition: QueueDefinition; updateStreamId: string }> {
  const { data } = await axios.get<{
    configuration: { queues: Record<string, QueueDefinition> };
  }>(
    new URL(
      'configuration/v2/configuration/platform/task-service/active',
      configurationServiceUrl
    ).href,
    {
      headers: { Authorization: `Bearer ${token}` },
      params: { orLatest: true },
    }
  );

  const queues = Object.values(data?.configuration?.queues || {});
  const choices = queues.map((queue) => `${queue.namespace}:${queue.name}`);
  if (choices.length < 1) {
    throw new Error('No queues definitions found.');
  }

  const { definition } = await prompt<{ definition: string }>({
    type: 'autocomplete',
    name: 'definition',
    message: 'Which queue definition do you want to generate a task list for?',
    choices,
  });

  const queueDefinition = queues.find(
    (queue) => `${queue.namespace}:${queue.name}` === definition
  );

  const { addStream } = await prompt<{ addStream: boolean }>({
    type: 'confirm',
    name: 'addStream',
    message: 'Do you want to add an event stream for live updates?',
  });

  const { fileName } = names(queueDefinition.name);
  let updateStreamId = '';
  if (addStream) {
    updateStreamId = `${fileName}-updates`;
    const result = await axios.patch(
      new URL(
        'configuration/v2/configuration/platform/push-service',
        configurationServiceUrl
      ).href,
      {
        operation: 'UPDATE',
        update: {
          [updateStreamId]: {
            id: updateStreamId,
            name: `${queueDefinition.name} updates`,
            description: `Provides updates of task events associated with queue ${queueDefinition.namespace}:${queueDefinition.name}.`,
            events: [
              'task-created',
              'task-assigned',
              'task-priority-set',
              'task-started',
              'task-completed',
              'task-cancelled',
              'task-updated',
            ].map((eventName) => ({
              namespace: 'task-service',
              name: eventName,
              criteria: {
                context: {
                  queueNamespace: queueDefinition.namespace,
                  queueName: queueDefinition.name,
                },
              },
            })),
            webhooks: [],
            subscriberRoles: [
              ...new Set([
                ...(queueDefinition.workerRoles || []),
                ...(queueDefinition.assignerRoles || []),
              ]),
            ],
            publicSubscribe: false,
          },
        },
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (result.status === 200) {
      console.log(`Created push stream ${updateStreamId} for task updates.`);
    }
  }

  return { queueDefinition, updateStreamId };
}

async function normalizeOptions(
  host: Tree,
  options: Schema
): Promise<NormalizedSchema> {
  const { env, accessToken } = options;

  const projectName = names(options.project).fileName;
  const projectRoot = `${getWorkspaceLayout(host).appsDir}/${projectName}`;

  const environment = environments[env || 'prod'];
  const urls = await getServiceUrls(environment.directoryServiceUrl);
  const tenantServiceUrl = urls['urn:ads:platform:tenant-service:v2'];
  const configurationServiceUrl =
    urls['urn:ads:platform:configuration-service'];

  let tenantToken = accessToken;
  if (!accessToken) {
    const environmentFile = `${projectRoot}/src/environments/environment.ts`;

    const result = host.read(environmentFile)?.toString();
    let realm = /realm: '([a-zA-Z0-9-]{36})',/.exec(result)?.[1];
    if (!realm) {
      const token = await realmLogin(environment.accessServiceUrl, 'core');
      const tenant = await selectTenant(tenantServiceUrl, token);
      realm = tenant.realm;
    }

    tenantToken = await realmLogin(environment.accessServiceUrl, realm);
  }

  const { queueDefinition, updateStreamId } = await getQueueDefinition(
    configurationServiceUrl,
    tenantToken
  );

  return {
    ...options,
    projectRoot,
    queueDefinition,
    updateStreamId,
  };
}

async function addFiles(host: Tree, options: NormalizedSchema) {
  const queueNames = names(options.queueDefinition.name);

  const templateOptions = {
    ...options,
    ...queueNames,
    queueNamespace: options.queueDefinition.namespace,
    queueName: options.queueDefinition.name,
    tmpl: '',
  };
  generateFiles(
    host,
    path.join(__dirname, 'files'),
    `${options.projectRoot}/src/app`,
    templateOptions
  );
}

export default async function (host: Tree, options: Schema) {
  const normalizedOptions = await normalizeOptions(host, options);
  await addFiles(host, normalizedOptions);
  await formatFiles(host);

  return;
}
