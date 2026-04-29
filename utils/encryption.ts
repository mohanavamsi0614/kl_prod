import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bits recommended for GCM

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

let derivedKey: Buffer | null = null;
function getKey(): Buffer {
  if (derivedKey) {
    return derivedKey;
  }
  if (!ENCRYPTION_KEY) {
    // Fail fast — encryption must have a secret configured
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }

  // ... rest of the logic
  derivedKey = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();
  return derivedKey;
}

export const encryptToken = (text: string): string => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encryptedBuf = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted (hex parts)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encryptedBuf.toString('hex')}`;
};

export const decryptToken = (text: string): string => {
  const parts = text.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = getKey();

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decryptedBuf = Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]);
  return decryptedBuf.toString('utf8');
};
