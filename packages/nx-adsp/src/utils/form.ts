import { compile } from 'json-schema-to-typescript';

export interface FormDefinition {
  id: string;
  name: string;
  dataSchema: Record<string, unknown>;
  assessorRoles: string[];
  applicantRoles: string[];
}

export async function generateFormInterface({
  name,
  dataSchema,
}: FormDefinition): Promise<string> {
  const types = await compile(dataSchema, name, {
    additionalProperties: false,
    bannerComment: '',
    format: false,
  });

  return types;
}
