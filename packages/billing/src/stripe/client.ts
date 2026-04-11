const STRIPE_API_BASE = 'https://api.stripe.com/v1';

export class StripeClient {
  constructor(private secretKey: string) {}

  async request<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    const url = `${STRIPE_API_BASE}${path}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    const init: RequestInit = { method, headers };

    if (body) {
      init.body = this.encodeFormData(body);
    }

    const response = await fetch(url, init);
    const data = await response.json() as any;

    if (!response.ok) {
      throw new StripeApiError(
        data.error?.message ?? `Stripe API error: ${response.status}`,
        data.error?.type,
        data.error?.code,
        response.status
      );
    }

    return data as T;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async del<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  private encodeFormData(data: Record<string, unknown>, prefix = ''): string {
    const parts: string[] = [];

    for (const [key, value] of Object.entries(data)) {
      const fullKey = prefix ? `${prefix}[${key}]` : key;

      if (value === undefined || value === null) continue;

      if (typeof value === 'object' && !Array.isArray(value)) {
        parts.push(this.encodeFormData(value as Record<string, unknown>, fullKey));
      } else {
        parts.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(String(value))}`);
      }
    }

    return parts.filter(Boolean).join('&');
  }
}

export class StripeApiError extends Error {
  constructor(
    message: string,
    public stripeType?: string,
    public stripeCode?: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'StripeApiError';
  }
}
