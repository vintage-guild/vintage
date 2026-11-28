import { describe, expect, it } from 'vitest';
import { FEATURES, featureOn } from './index';

describe('feature flags', () => {
  it('answers each flag as FEATURES sets it', () => {
    for (const feature of Object.keys(FEATURES) as (keyof typeof FEATURES)[]) {
      expect(featureOn(feature)).toBe(FEATURES[feature]);
    }
  });

  it('has Polls off', () => {
    expect(featureOn('polls')).toBe(false);
  });
});
