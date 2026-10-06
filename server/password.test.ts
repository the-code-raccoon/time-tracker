import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('verifies the correct password and rejects others', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^scrypt:\d+:\d+:\d+:[\w-]+:[\w-]+$/);
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', hash)).resolves.toBe(false);
  });

  it('salts each hash', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('does not contain $ so dotenv expansion cannot mangle it', async () => {
    expect(await hashPassword('x')).not.toContain('$');
  });

  it('rejects an empty password and malformed hashes', async () => {
    await expect(hashPassword('')).rejects.toThrow();
    await expect(verifyPassword('x', 'not-a-hash')).rejects.toThrow('Malformed');
  });
});
