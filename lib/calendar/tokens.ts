import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const ENC_PREFIX = 'enc:';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey(): Buffer {
  const raw = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'Missing CALENDAR_TOKEN_ENCRYPTION_KEY (generate with: openssl rand -hex 32)'
    );
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) {
    throw new Error(
      `CALENDAR_TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex chars), got ${key.length} bytes`
    );
  }
  return key;
}

export function isTokenEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decryptToken(value: string): string {
  if (!isTokenEncrypted(value)) {
    return value;
  }
  const payload = Buffer.from(value.slice(ENC_PREFIX.length), 'base64');
  if (payload.length < IV_BYTES + TAG_BYTES) {
    throw new Error('Encrypted token payload is too short');
  }
  const iv = payload.subarray(0, IV_BYTES);
  const tag = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = payload.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    'utf8'
  );
}