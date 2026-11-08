import { describe, expect, it } from 'vitest';
import { excludedState } from './remove-noncontiguous';

describe('Alaska/Hawaii cleanup geography', () => {
  it('includes Alaska, the Aleutians across the date line, and Hawaii', () => {
    for (const [lat, lng] of [[61.2, -149.9], [52, 179], [21.3, -157.8]]) expect(excludedState(lat, lng)).toBe(true);
  });
  it('preserves mainland and other territories', () => {
    for (const [lat, lng] of [[47.6, -122.3], [25.8, -80.2], [32.8, -96.8], [18.4, -66.1]]) expect(excludedState(lat, lng)).toBe(false);
  });
});
