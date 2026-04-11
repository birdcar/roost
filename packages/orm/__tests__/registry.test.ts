import { describe, test, expect } from 'bun:test';
import { ModelRegistry, toTableName } from '../src/registry';

describe('toTableName', () => {
  test('converts PascalCase to snake_case plural', () => {
    expect(toTableName('User')).toBe('users');
    expect(toTableName('Post')).toBe('posts');
    expect(toTableName('UserProfile')).toBe('user_profiles');
    expect(toTableName('BlogPostComment')).toBe('blog_post_comments');
  });
});

describe('ModelRegistry', () => {
  test('registers model classes', () => {
    const registry = new ModelRegistry();
    const FakeModel = { name: 'User', columns: {}, timestamps: true, softDeletes: false, tableName: null, _table: null, _db: null } as any;

    registry.register(FakeModel);

    expect(registry.getModels().has('User')).toBe(true);
  });
});
