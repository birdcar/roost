import { Model } from '@roost/orm';
import { text, integer } from 'drizzle-orm/sqlite-core';

export class Member extends Model {
  static tableName = 'members';

  static columns = {
    org_id: integer('org_id').notNull(),
    workos_user_id: text('workos_user_id').notNull(),
    role: text('role').notNull().default('member'), // admin | member | viewer
  };
}
