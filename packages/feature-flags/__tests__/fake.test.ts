import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { FeatureFlag } from '../src/feature-flag';

beforeEach(() => {
  FeatureFlag.restore();
});

afterEach(() => {
  FeatureFlag.restore();
});

describe('FeatureFlag fake', () => {
  test('fake() installs fake; isEnabled returns true for flagged-as-true', async () => {
    FeatureFlag.fake({ 'feature-x': true });
    expect(await FeatureFlag.isEnabled('feature-x')).toBe(true);
  });

  test('fake() installs fake; isEnabled returns false for flagged-as-false', async () => {
    FeatureFlag.fake({ 'feature-x': false });
    expect(await FeatureFlag.isEnabled('feature-x')).toBe(false);
  });

  test('restore() removes fake; subsequent calls go to real store', async () => {
    FeatureFlag.fake({ 'feature-x': true });
    FeatureFlag.restore();

    await expect(FeatureFlag.isEnabled('feature-x')).rejects.toThrow(
      'FeatureFlag store is not configured'
    );
  });

  test('assertChecked throws if flag was never read', () => {
    FeatureFlag.fake({ 'feature-x': true });
    expect(() => FeatureFlag.assertChecked('feature-x')).toThrow(
      'Expected flag "feature-x" to be checked, but it was not'
    );
  });

  test('assertChecked passes if flag was read at least once', async () => {
    FeatureFlag.fake({ 'feature-x': true });
    await FeatureFlag.isEnabled('feature-x');
    expect(() => FeatureFlag.assertChecked('feature-x')).not.toThrow();
  });

  test('assertChecked throws if fake() was not called', () => {
    expect(() => FeatureFlag.assertChecked('feature-x')).toThrow('FeatureFlag.fake() was not called');
  });
});
