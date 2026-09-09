import { describe, expect, it } from 'vitest';
import en from './en.json';
import es from './es.json';

/** Collect every dot-path key in a nested dictionary object. */
function collectKeys(obj, prefix = '') {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) keys.push(...collectKeys(v, path));
    else keys.push(path);
  }
  return keys.sort();
}

describe('i18n dictionaries', () => {
  it('en and es expose the same key set', () => {
    expect(collectKeys(es)).toEqual(collectKeys(en));
  });

  it('every en string has a non-empty es translation', () => {
    const flat = (obj, prefix = '') =>
      Object.entries(obj).flatMap(([k, v]) => {
        const path = prefix ? `${prefix}.${k}` : k;
        return v && typeof v === 'object' ? flat(v, path) : [[path, v]];
      });
    for (const [path, value] of flat(es)) {
      expect(typeof value, path).toBe('string');
      expect(value.trim().length, path).toBeGreaterThan(0);
    }
  });
});
