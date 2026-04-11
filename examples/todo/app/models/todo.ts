import { Model } from '@roost/orm';
import { text, integer } from 'drizzle-orm/sqlite-core';

export class Todo extends Model {
  static tableName = 'todos';

  static columns = {
    title: text('title').notNull(),
    completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
    user_id: text('user_id').notNull(),
  };
}
