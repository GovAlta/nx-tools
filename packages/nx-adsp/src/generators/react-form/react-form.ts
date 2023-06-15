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
import { FormDefinition, generateFormInterface } from '../../utils/form';

async function getFormDefinition(
  formServiceUrl: string,
  token: string
): Promise<FormDefinition> {
  const { data: definitions } = await axios.get<FormDefinition[]>(
    new URL('form/v1/definitions', formServiceUrl).href,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const choices = definitions
    .filter((r) => !!r.dataSchema)
    .map((r) => r.name)
    .sort((a, b) => a.localeCompare(b));

  if (choices.length < 1) {
    throw new Error('No form definitions with data schema found.');
  }

  const result = await prompt<{ definition: string }>({
    type: 'autocomplete',
    name: 'definition',
    message: 'Which form definition do you want to generate a component for?',
    choices,
  });

  const formDefinition = definitions.find((r) => r.name === result.definition);

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

  let tenantToken = accessToken;
  if (!accessToken) {
    const token = await realmLogin(environment.accessServiceUrl, 'core');
    const tenant = await selectTenant(
      urls['urn:ads:platform:tenant-service'],
      token
    );
    tenantToken = await realmLogin(environment.accessServiceUrl, tenant.realm);
  }
  const formServiceUrl = urls['urn:ads:platform:form-service'];
  const formDefinition = await getFormDefinition(formServiceUrl, tenantToken);

  return {
    ...options,
    projectRoot,
    formServiceUrl,
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
    tmpl: '',
  };
  generateFiles(
    host,
    path.join(__dirname, 'files'),
    options.projectRoot,
    templateOptions
  );
}

export default async function (host: Tree, options: Schema) {
  const normalizedOptions = await normalizeOptions(host, options);
  await addFiles(host, normalizedOptions);

  return () => {
    formatFiles(host);
  };
}
