import { Model } from '@roostjs/orm';
import { text, integer } from 'drizzle-orm/sqlite-core';

export class Project extends Model {
  static tableName = 'projects';

  static columns = {
    org_id: integer('org_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
  };
}
