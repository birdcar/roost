import { TenantNotResolvedError } from './errors.js';
import type { TenantContext } from './tenant-context.js';

export interface OrgResolvable {
  resolve(request: Request): { slug: string } | null;
}

export class TenantScopeMiddleware {
  constructor(
    private resolver: OrgResolvable,
    private orgLookup: (slug: string) => Promise<{ id: string } | null>,
    private ctx: TenantContext,
  ) {}

  async handle(request: Request, next: () => Promise<Response>): Promise<Response> {
    const resolved = this.resolver.resolve(request);
    if (resolved) {
      const org = await this.orgLookup(resolved.slug);
      if (!org) throw new TenantNotResolvedError(resolved.slug);
      this.ctx.set({ orgId: org.id, orgSlug: resolved.slug });
    }
    return next();
  }
}
