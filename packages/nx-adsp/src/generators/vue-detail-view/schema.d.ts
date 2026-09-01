export interface DetailViewField {
  key: string;
  label: string;
  type?: 'text' | 'date' | 'currency' | 'badge';
  /**
   * Value -> label for a coded field. Supply this whenever the stored value is a
   * code rather than prose, or the view renders the raw code.
   */
  options?: { value: string; label: string }[];
  /**
   * `badge` only. Value -> goa-badge type. Unmapped values render neutral.
   */
  badgeMap?: Record<
    string,
    | 'information'
    | 'success'
    | 'important'
    | 'emergency'
    | 'dark'
    | 'midtone'
    | 'light'
  >;
}

export interface Schema {
  project: string;
  name: string;
  resource: string;
  route: string;
  /**
   * JSON string on the real CLI (Nx's array-typed CLI coercion only supports
   * comma-separated primitives, not JSON -- see schema.json). A real array is
   * also accepted for programmatic callers (e.g. tests).
   */
  fields: string | DetailViewField[];
  heading?: string;
  requiresAuth?: boolean;
}

export interface NormalizedSchema extends Omit<Schema, 'fields'> {
  projectRoot: string;
  /** PascalCase view name with a "View" suffix, e.g. ApplicationDetailView. */
  viewFileName: string;
  fields: DetailViewField[];
  heading: string;
  requiresAuth: boolean;
}
