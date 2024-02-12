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
} from '@nx/devkit';
import axios from 'axios';
import { prompt } from 'enquirer';
import * as path from 'path';
import { NormalizedSchema, Schema } from './schema';
import { FormDefinition, generateFormInterface } from '../../utils/form';

async function getFormDefinition(
  configurationServiceUrl: string,
  token: string
): Promise<FormDefinition> {
  const { data } = await axios.get<Record<string, FormDefinition>>(
    new URL(
      'configuration/v2/configuration/platform/form-service/latest',
      configurationServiceUrl
    ).href,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const definitions = Object.values(data);
  const choices = definitions
    .filter((r) => !!r.dataSchema)
    .map((r) => r.name)
    .sort((a, b) => a.localeCompare(b));

  if (choices.length < 1) {
    throw new Error('No form definitions with data schema found.');
  }

  const { definition } = await prompt<{ definition: string }>({
    type: 'autocomplete',
    name: 'definition',
    message: 'Which form definition do you want to generate a component for?',
    choices,
  });

  const formDefinition = definitions.find((r) => r.name === definition);

  const general = {
    type: 'object',
    className: 'General',
    properties: {},
  };
  let addGeneral = false;
  Object.entries(formDefinition.dataSchema.properties || {}).forEach(
    ([property, value]) => {
      if (value.type !== 'object') {
        general.properties[property] = value;
        delete formDefinition.dataSchema.properties[property];
        addGeneral = true;
      } else {
        value.className = names(property).className;
      }
    }
  );

  if (addGeneral) {
    formDefinition.dataSchema.properties = {
      general,
      ...(formDefinition.dataSchema.properties as object),
    };
  }

  const fileTypeName = `${formDefinition.name} files`;
  const fileTypeId = `${names(formDefinition.name).fileName}-files`;
  const { addFileType } = await prompt<{ addFileType: boolean }>({
    type: 'confirm',
    name: 'addFileType',
    message: `Create file type (${fileTypeName}) for form files?`,
  });

  if (addFileType) {
    await axios.patch<Record<string, FormDefinition>>(
      new URL(
        'configuration/v2/configuration/platform/file-service',
        configurationServiceUrl
      ).href,
      {
        operation: 'UPDATE',
        update: {
          [fileTypeId]: {
            id: fileTypeId,
            name: fileTypeName,
            readRoles: formDefinition.assessorRoles,
            updateRoles: formDefinition.applicantRoles,
            anonymousRead: false,
          },
        },
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
  }

  return formDefinition;
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

  const formDefinition = await getFormDefinition(
    configurationServiceUrl,
    tenantToken
  );

  return {
    ...options,
    projectRoot,
    formDefinition,
  };
}

async function addFiles(host: Tree, options: NormalizedSchema) {
  const formNames = names(options.formDefinition.name);
  const interfaceDefinition = await generateFormInterface(
    options.formDefinition
  );

  const templateOptions = {
    ...options,
    ...options.formDefinition,
    ...formNames,
    interfaceDefinition,
    includesPath: path.join(__dirname, 'includes'),
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
