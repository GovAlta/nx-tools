export interface IntakeViewField {
  key: string;
  label: string;
  type?: 'text' | 'textarea' | 'number' | 'date' | 'select';
  /** `select` only. Rendered as goa-dropdown-item children. */
  options?: { value: string; label: string }[];
  required?: boolean;
}

export interface IntakeViewStep {
  key: string;
  label: string;
  fields: IntakeViewField[];
}

export interface Schema {
  project: string;
  name: string;
  resource: string;
  route: string;
  /**
   * JSON string on the real CLI (Nx's array-typed CLI coercion only supports
   * comma-separated primitives, not JSON). A real array is also accepted for
   * programmatic callers (e.g. tests).
   */
  steps: string | IntakeViewStep[];
  /**
   * Field on the submitted record holding the business reference shown on the
   * confirmation page, e.g. `reference`. Defaults to `reference`; falls back to
   * the route id when the record has no such field.
   */
  referenceField?: string;
  /** Human title used in headings, e.g. "Compensation claim". */
  heading?: string;
  requiresAuth?: boolean;
}

export interface NormalizedSchema extends Omit<Schema, 'steps'> {
  projectRoot: string;
  steps: IntakeViewStep[];
  requiresAuth: boolean;
  referenceField: string;
  heading: string;
  /** PascalCase base name, e.g. "Application" for --name application. */
  baseName: string;
}
