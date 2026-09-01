export interface WorkspaceViewColumn {
  key: string;
  label: string;
  type?: 'text' | 'date' | 'currency' | 'badge';
  sortable?: boolean;
  /**
   * Value -> label for a coded column. Supply this whenever the stored value is
   * a code rather than prose, or the table renders the raw code.
   */
  options?: { value: string; label: string }[];
  /**
   * `badge` only. Value -> goa-badge type, e.g.
   * `{ approved: 'success', declined: 'emergency' }`. Unmapped values render
   * neutral.
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

export interface WorkspaceViewFilter {
  key: string;
  label: string;
  type: 'dropdown' | 'date';
  /** Dropdown only. Omit and populate `filterDescriptors` at runtime to fetch them. */
  options?: { value: string; label: string }[];
  /** Dropdown only. Label for the "no filter" choice. Defaults to "Any". */
  anyLabel?: string;
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
  /** Same JSON-string-on-the-CLI reasoning as `columns`. */
  filters?: string | WorkspaceViewFilter[];
  detailRoute?: string;
  heading?: string;
  pageSize?: number;
  filterable?: boolean;
  /** Ionicon name for the side-menu entry. Defaults per generator. */
  icon?: string;
  requiresAuth?: boolean;
}

export interface NormalizedSchema extends Omit<Schema, 'columns' | 'filters'> {
  projectRoot: string;
  /** PascalCase view name with a "ListView" suffix, e.g. ApplicationsListView. */
  viewFileName: string;
  columns: WorkspaceViewColumn[];
  /** Empty when --filters wasn't given, so the template can skip the FilterBar. */
  filters: WorkspaceViewFilter[];
  heading: string;
  pageSize: number;
  filterable: boolean;
  requiresAuth: boolean;
  /** Always present (null when not given) so the template's `with` binding can reference it. */
  detailRoute: string | null;
}
