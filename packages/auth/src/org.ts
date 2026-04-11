export interface ResolvedOrg {
  slug: string;
  id?: string;
}

export type OrgResolutionStrategy = 'subdomain' | 'path-prefix' | 'header';

export class OrgResolver {
  private strategies: OrgResolutionStrategy[];

  constructor(strategies: OrgResolutionStrategy[] = ['subdomain', 'path-prefix', 'header']) {
    this.strategies = strategies;
  }

  resolve(request: Request): ResolvedOrg | null {
    for (const strategy of this.strategies) {
      const result = this.resolveWith(strategy, request);
      if (result) return result;
    }
    return null;
  }

  private resolveWith(strategy: OrgResolutionStrategy, request: Request): ResolvedOrg | null {
    switch (strategy) {
      case 'subdomain':
        return this.fromSubdomain(request);
      case 'path-prefix':
        return this.fromPathPrefix(request);
      case 'header':
        return this.fromHeader(request);
    }
  }

  private fromSubdomain(request: Request): ResolvedOrg | null {
    const url = new URL(request.url);
    const parts = url.hostname.split('.');
    if (parts.length < 3) return null;
    const slug = parts[0];
    if (slug === 'www' || slug === 'api') return null;
    return { slug };
  }

  private fromPathPrefix(request: Request): ResolvedOrg | null {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/org\/([^/]+)/);
    if (!match) return null;
    return { slug: match[1] };
  }

  private fromHeader(request: Request): ResolvedOrg | null {
    const slug = request.headers.get('x-org-slug');
    if (!slug) return null;
    return { slug };
  }
}
