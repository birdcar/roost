import { eq, and, or, inArray, isNull, isNotNull, like, sql, asc, desc } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { SQLiteTableWithColumns } from 'drizzle-orm/sqlite-core';
import { OrmNotBootedError, ModelNotFoundError } from './errors.js';
import { fireHook, registerHook } from './hooks.js';
import type { PaginationResult, ModelAttributes, HookName, HookFn } from './types.js';

export abstract class Model {
  static tableName: string | null = null;
  static primaryKey = 'id';
  static timestamps = true;
  static softDeletes = false;

  static _table: SQLiteTableWithColumns<any> | null = null;
  static _db: DrizzleD1Database<any> | null = null;

  readonly attributes: ModelAttributes;

  constructor(attributes: ModelAttributes) {
    this.attributes = { ...attributes };
    return new Proxy(this, {
      get(target, prop: string) {
        if (prop in target) return (target as any)[prop];
        if (prop in target.attributes) return target.attributes[prop];
        return undefined;
      },
    });
  }

  private static ensureBooted(): { db: DrizzleD1Database<any>; table: SQLiteTableWithColumns<any> } {
    if (!this._db || !this._table) throw new OrmNotBootedError(this.name);
    return { db: this._db, table: this._table };
  }

  static where<T extends typeof Model>(this: T, column: string, valueOrOp: unknown, maybeValue?: unknown): QueryBuilder<T> {
    const qb = new QueryBuilder(this);
    if (maybeValue !== undefined) {
      return qb.where(column, valueOrOp as string, maybeValue);
    }
    return qb.where(column, valueOrOp);
  }

  static whereIn<T extends typeof Model>(this: T, column: string, values: unknown[]): QueryBuilder<T> {
    return new QueryBuilder(this).whereIn(column, values);
  }

  static async find<T extends typeof Model>(this: T, id: unknown): Promise<InstanceType<T> | null> {
    const { db, table } = this.ensureBooted();
    const rows = await db.select().from(table).where(eq(table[this.primaryKey], id)).limit(1);
    if (rows.length === 0) return null;
    return new (this as any)(rows[0]) as InstanceType<T>;
  }

  static async findOrFail<T extends typeof Model>(this: T, id: unknown): Promise<InstanceType<T>> {
    const result = await this.find(id);
    if (!result) throw new ModelNotFoundError(this.name, id);
    return result;
  }

  static async all<T extends typeof Model>(this: T): Promise<InstanceType<T>[]> {
    const { db, table } = this.ensureBooted();
    const rows = await db.select().from(table);
    return rows.map((r) => new (this as any)(r) as InstanceType<T>);
  }

  static async create<T extends typeof Model>(this: T, attrs: ModelAttributes): Promise<InstanceType<T>> {
    const { db, table } = this.ensureBooted();
    const instance = new (this as any)(attrs) as InstanceType<T>;

    const shouldContinue = await fireHook(this, 'creating', instance);
    if (!shouldContinue) throw new Error(`Creating ${this.name} aborted by hook`);

    if ((this as any).timestamps) {
      const now = new Date().toISOString();
      attrs.created_at = attrs.created_at ?? now;
      attrs.updated_at = attrs.updated_at ?? now;
    }

    const rows = await db.insert(table).values(attrs).returning();
    const created = new (this as any)(rows[0]) as InstanceType<T>;

    await fireHook(this, 'created', created);
    return created;
  }

  async save(): Promise<this> {
    const ctor = this.constructor as typeof Model;
    const { db, table } = ctor.ensureBooted();
    const id = this.attributes[ctor.primaryKey];

    if (id) {
      const shouldContinue = await fireHook(ctor, 'updating', this);
      if (!shouldContinue) throw new Error(`Updating ${ctor.name} aborted by hook`);

      if (ctor.timestamps) {
        this.attributes.updated_at = new Date().toISOString();
      }

      await db.update(table).set(this.attributes).where(eq(table[ctor.primaryKey], id));
      await fireHook(ctor, 'updated', this);
    }
    return this;
  }

  async delete(): Promise<void> {
    const ctor = this.constructor as typeof Model;
    const { db, table } = ctor.ensureBooted();
    const id = this.attributes[ctor.primaryKey];

    const shouldContinue = await fireHook(ctor, 'deleting', this);
    if (!shouldContinue) throw new Error(`Deleting ${ctor.name} aborted by hook`);

    if (ctor.softDeletes) {
      await db.update(table).set({ deleted_at: new Date().toISOString() }).where(eq(table[ctor.primaryKey], id));
    } else {
      await db.delete(table).where(eq(table[ctor.primaryKey], id));
    }

    await fireHook(ctor, 'deleted', this);
  }

  static on(event: HookName, fn: HookFn): void {
    registerHook(this, event, fn);
  }
}

export class QueryBuilder<TModel extends typeof Model> {
  private wheres: Array<{ type: 'and' | 'or'; column: string; op: string; value: unknown }> = [];
  private orders: Array<{ column: string; direction: 'asc' | 'desc' }> = [];
  private limitValue: number | null = null;
  private offsetValue: number | null = null;
  private eagerLoad: string[] = [];

  constructor(private modelClass: TModel) {}

  where(column: string, value: unknown): this;
  where(column: string, op: string, value: unknown): this;
  where(column: string, opOrValue: unknown, maybeValue?: unknown): this {
    if (maybeValue !== undefined) {
      this.wheres.push({ type: 'and', column, op: opOrValue as string, value: maybeValue });
    } else {
      this.wheres.push({ type: 'and', column, op: '=', value: opOrValue });
    }
    return this;
  }

  orWhere(column: string, value: unknown): this {
    this.wheres.push({ type: 'or', column, op: '=', value });
    return this;
  }

  whereIn(column: string, values: unknown[]): this {
    this.wheres.push({ type: 'and', column, op: 'in', value: values });
    return this;
  }

  whereNull(column: string): this {
    this.wheres.push({ type: 'and', column, op: 'is_null', value: null });
    return this;
  }

  whereNotNull(column: string): this {
    this.wheres.push({ type: 'and', column, op: 'is_not_null', value: null });
    return this;
  }

  orderBy(column: string, direction: 'asc' | 'desc' = 'asc'): this {
    this.orders.push({ column, direction });
    return this;
  }

  limit(n: number): this {
    this.limitValue = n;
    return this;
  }

  offset(n: number): this {
    this.offsetValue = n;
    return this;
  }

  with(...relations: string[]): this {
    this.eagerLoad.push(...relations);
    return this;
  }

  async first(): Promise<InstanceType<TModel> | null> {
    this.limitValue = 1;
    const results = await this.execute();
    return results[0] ?? null;
  }

  async firstOrFail(): Promise<InstanceType<TModel>> {
    const result = await this.first();
    if (!result) throw new ModelNotFoundError(this.modelClass.name, 'query');
    return result;
  }

  async all(): Promise<InstanceType<TModel>[]> {
    return this.execute();
  }

  async count(): Promise<number> {
    const { db, table } = this.getDbAndTable();
    let query = db.select({ count: sql<number>`count(*)` }).from(table);
    if (this.wheres.length > 0) {
      query = query.where(this.buildWhereClause(table)) as any;
    }
    const rows = await query;
    return (rows[0] as any)?.count ?? 0;
  }

  async paginate(page: number, perPage: number): Promise<PaginationResult<InstanceType<TModel>>> {
    const total = await this.count();
    this.limitValue = perPage;
    this.offsetValue = (page - 1) * perPage;
    const data = await this.execute();

    return {
      data,
      total,
      perPage,
      currentPage: page,
      lastPage: Math.ceil(total / perPage),
    };
  }

  private async execute(): Promise<InstanceType<TModel>[]> {
    const { db, table } = this.getDbAndTable();

    let query = db.select().from(table) as any;

    if (this.wheres.length > 0) {
      query = query.where(this.buildWhereClause(table));
    }

    for (const order of this.orders) {
      const col = table[order.column];
      query = query.orderBy(order.direction === 'desc' ? desc(col) : asc(col));
    }

    if (this.limitValue !== null) query = query.limit(this.limitValue);
    if (this.offsetValue !== null) query = query.offset(this.offsetValue);

    const rows = await query;
    return rows.map((r: any) => new (this.modelClass as any)(r) as InstanceType<TModel>);
  }

  private getDbAndTable() {
    const db = this.modelClass._db;
    const table = this.modelClass._table;
    if (!db || !table) throw new OrmNotBootedError(this.modelClass.name);
    return { db, table };
  }

  private buildWhereClause(table: any): any {
    const conditions = this.wheres.map((w) => {
      const col = table[w.column];
      switch (w.op) {
        case '=': return eq(col, w.value);
        case '!=': return sql`${col} != ${w.value}`;
        case '>': return sql`${col} > ${w.value}`;
        case '>=': return sql`${col} >= ${w.value}`;
        case '<': return sql`${col} < ${w.value}`;
        case '<=': return sql`${col} <= ${w.value}`;
        case 'like': return like(col, w.value as string);
        case 'in': return inArray(col, w.value as unknown[]);
        case 'is_null': return isNull(col);
        case 'is_not_null': return isNotNull(col);
        default: return eq(col, w.value);
      }
    });

    if (conditions.length === 1) return conditions[0];

    const hasOr = this.wheres.some((w) => w.type === 'or');
    if (hasOr) return or(...conditions);
    return and(...conditions);
  }
}
