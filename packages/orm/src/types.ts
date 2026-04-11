export interface PaginationResult<T> {
  data: T[];
  total: number;
  perPage: number;
  currentPage: number;
  lastPage: number;
}

export type ModelAttributes = Record<string, unknown>;

export type HookName =
  | 'creating'
  | 'created'
  | 'updating'
  | 'updated'
  | 'deleting'
  | 'deleted';

export type HookFn = (model: any) => boolean | void | Promise<boolean | void>;
