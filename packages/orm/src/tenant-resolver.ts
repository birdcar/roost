export class TenantDatabaseResolver {
  constructor(
    private pattern: string = 'DB_TENANT_{SLUG}',
    private resolveBinding: (name: string) => globalThis.D1Database | null,
  ) {}

  resolve(slug: string): globalThis.D1Database | null {
    const bindingName = this.pattern.replace('{SLUG}', slug.toUpperCase().replace(/-/g, '_'));
    return this.resolveBinding(bindingName);
  }
}
