let activeFake: RateLimiterFake | null = null;

export class RateLimiterFake {
  private limitedKeys = new Set<string>();
  private checkedKeys = new Set<string>();
  private allowedCheckedKeys = new Set<string>();

  limitKey(key: string): void {
    this.limitedKeys.add(key);
  }

  allowKey(key: string): void {
    this.limitedKeys.delete(key);
  }

  recordCheck(key: string, wasLimited: boolean): void {
    this.checkedKeys.add(key);
    if (!wasLimited) {
      this.allowedCheckedKeys.add(key);
    }
  }

  isLimited(key: string): boolean {
    return this.limitedKeys.has(key);
  }

  assertLimited(key: string): void {
    if (!this.checkedKeys.has(key)) {
      throw new Error(`Expected key "${key}" to have been checked, but it was not`);
    }
    if (this.allowedCheckedKeys.has(key)) {
      throw new Error(`Expected key "${key}" to be limited, but it was allowed`);
    }
  }

  assertAllowed(key: string): void {
    if (!this.checkedKeys.has(key)) {
      throw new Error(`Expected key "${key}" to have been checked, but it was not`);
    }
    if (!this.allowedCheckedKeys.has(key)) {
      throw new Error(`Expected key "${key}" to be allowed, but it was limited`);
    }
  }

  assertChecked(key: string): void {
    if (!this.checkedKeys.has(key)) {
      throw new Error(`Expected key "${key}" to have been checked, but it was not`);
    }
  }

  reset(): void {
    this.limitedKeys.clear();
    this.checkedKeys.clear();
    this.allowedCheckedKeys.clear();
  }
}

export function fakeRateLimiter(): RateLimiterFake {
  activeFake = new RateLimiterFake();
  return activeFake;
}

export function restoreRateLimiter(): void {
  activeFake = null;
}

export function getActiveRateLimiterFake(): RateLimiterFake | null {
  return activeFake;
}
