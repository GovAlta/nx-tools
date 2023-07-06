import { FormDefinition, generateFormInterface } from './form';

describe('generateFormInterface', () => {
  const dataSchema = {
    type: 'object',
    properties: {
      firstName: {
        type: 'string',
      },
      lastName: {
        type: 'string',
      },
      age: {
        description: 'Age in years',
        type: 'integer',
        minimum: 0,
      },
      hairColor: {
        enum: ['black', 'brown', 'blue'],
        type: 'string',
      },
      personal: {
        type: 'object',
        properties: {
          firstName: {
            type: 'string',
          },
          lastName: {
            type: 'string',
          },
        },
      },
    },
    additionalProperties: false,
    required: ['firstName', 'lastName'],
  };

  it('can generate form interface', async () => {
    const result = await generateFormInterface({
      name: 'Test questionnaire',
      dataSchema: dataSchema as unknown,
    } as FormDefinition);

    expect(result).toBeTruthy();
    // expect(result).toMatchSnapshot();
  });
});
