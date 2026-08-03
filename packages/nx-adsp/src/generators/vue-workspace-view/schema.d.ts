export interface WorkspaceViewColumn {
  key: string;
  label: string;
  type?: 'text' | 'date' | 'currency' | 'badge';
  sortable?: boolean;
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
  columns: string | WorkspaceViewColumn[];
  detailRoute?: string;
  heading?: string;
  pageSize?: number;
  filterable?: boolean;
  requiresAuth?: boolean;
}

export interface NormalizedSchema extends Omit<Schema, 'columns'> {
  projectRoot: string;
  /** PascalCase view name with a "ListView" suffix, e.g. ApplicationsListView. */
  viewFileName: string;
  columns: WorkspaceViewColumn[];
  heading: string;
  pageSize: number;
  filterable: boolean;
  requiresAuth: boolean;
  /** Always present (null when not given) so the template's `with` binding can reference it. */
  detailRoute: string | null;
}
