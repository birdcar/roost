export class FlagStoreNotConfiguredError extends Error {
  constructor() {
    super(
      'FeatureFlag store is not configured. Did you register FeatureFlagServiceProvider?'
    );
    this.name = 'FlagStoreNotConfiguredError';
  }
}

export class FlagNotFoundError extends Error {
  constructor(flag: string) {
    super(`Feature flag "${flag}" not found in the store`);
    this.name = 'FlagNotFoundError';
  }
}
