import { drizzle } from 'drizzle-orm/d1';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import type { Model } from './model.js';

export class ModelRegistry {
  private models = new Map<string, typeof Model>();

  register(modelClass: typeof Model): void {
    this.models.set(modelClass.name, modelClass);
  }

  boot(d1: D1Database): void {
    const schema: Record<string, ReturnType<typeof sqliteTable>> = {};

    for (const [, modelClass] of this.models) {
      const tableName = modelClass.tableName ?? toTableName(modelClass.name);
      const columns: Record<string, any> = {
        id: integer('id').primaryKey({ autoIncrement: true }),
        ...(modelClass as any).columns,
      };

      if (modelClass.timestamps) {
        columns.created_at = text('created_at').notNull().$defaultFn(() => new Date().toISOString());
        columns.updated_at = text('updated_at').notNull().$defaultFn(() => new Date().toISOString());
      }

      if (modelClass.softDeletes) {
        columns.deleted_at = text('deleted_at');
      }

      const table = sqliteTable(tableName, columns);
      schema[tableName] = table;
      modelClass._table = table;
    }

    const db = drizzle(d1 as any, { schema });

    for (const [, modelClass] of this.models) {
      modelClass._db = db as any;
    }
  }

  getSchema(): Record<string, ReturnType<typeof sqliteTable>> {
    const schema: Record<string, ReturnType<typeof sqliteTable>> = {};
    for (const [, modelClass] of this.models) {
      const tableName = modelClass.tableName ?? toTableName(modelClass.name);
      if (modelClass._table) schema[tableName] = modelClass._table;
    }
    return schema;
  }

  getModels(): Map<string, typeof Model> {
    return this.models;
  }
}

export function toTableName(className: string): string {
  return className
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .slice(1) + 's';
}
