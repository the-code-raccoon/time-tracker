import { describe, expect, it } from 'vitest';
import { decrypt, encrypt } from './crypto.js';

const KEY = Buffer.alloc(32, 1).toString('base64');

describe('token encryption', () => {
  it('round-trips and uses a fresh IV each time', () => {
    const a = encrypt('1//refresh-token', KEY);
    expect(a).not.toContain('refresh');
    expect(encrypt('1//refresh-token', KEY)).not.toBe(a);
    expect(decrypt(a, KEY)).toBe('1//refresh-token');
  });

  it('rejects tampering, the wrong key and bad keys', () => {
    const [iv, tag, data] = encrypt('secret', KEY).split('.');
    expect(() => decrypt([iv, tag, `${data.slice(0, -2)}AA`].join('.'), KEY)).toThrow();
    expect(() => decrypt(encrypt('secret', KEY), Buffer.alloc(32, 2).toString('base64'))).toThrow();
    expect(() => encrypt('x', 'short')).toThrow('32 bytes');
  });
});
