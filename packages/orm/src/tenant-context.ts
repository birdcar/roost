export interface TenantContextData {
  orgId: string;
  orgSlug: string;
}

export class TenantContext {
  private data: TenantContextData | null = null;
  private bypassed = false;

  set(data: TenantContextData): void {
    this.data = data;
  }

  get(): TenantContextData | null {
    return this.data;
  }

  isBypassed(): boolean {
    return this.bypassed;
  }

  bypass(): void {
    this.bypassed = true;
  }

  restore(): void {
    this.bypassed = false;
  }
}
