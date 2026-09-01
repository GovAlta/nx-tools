export interface AdminCrudField {
  key: string;
  label: string;
  type?: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox';
  /** `select` only. Rendered as goa-dropdown-item children. */
  options?: { value: string; label: string }[];
  required?: boolean;
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
  fields: string | AdminCrudField[];
  heading?: string;
  singularLabel?: string;
  /** Ionicon name for the side-menu entry. Defaults per generator. */
  icon?: string;
  requiresAuth?: boolean;
}

export interface NormalizedSchema extends Omit<Schema, 'fields'> {
  projectRoot: string;
  /** PascalCase view name with a "ListView" suffix, e.g. RegionsListView. */
  listViewFileName: string;
  /** PascalCase view name with an "EditView" suffix, e.g. RegionsEditView. */
  editViewFileName: string;
  fields: AdminCrudField[];
  heading: string;
  singularLabel: string;
  requiresAuth: boolean;
}
