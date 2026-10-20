import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();
  const plaintext = 'a-correct-horse-battery-staple-123';
  let hash: string;

  beforeAll(async () => {
    hash = await service.hash(plaintext);
  });

  it('hashes with bcrypt rather than storing the plaintext', () => {
    expect(hash).not.toBe(plaintext);
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
  });

  it('accepts the correct password', async () => {
    await expect(service.compare(plaintext, hash)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    await expect(service.compare('wrong-password', hash)).resolves.toBe(
      false,
    );
  });
});
