import { compile } from 'json-schema-to-typescript';

export interface FormDefinition {
  name: string;
  dataSchema: Record<string, unknown>;
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
