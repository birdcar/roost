import { Model } from '@roost/orm';
import { text } from 'drizzle-orm/sqlite-core';

export class Organization extends Model {
  static tableName = 'organizations';

  static columns = {
    workos_org_id: text('workos_org_id').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
  };
}
