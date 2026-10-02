const crypto = require('crypto');

const PREFIX = 'enc:v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const AAD = Buffer.from('deliveryapp:waafi-api-key:v1', 'utf8');

function deriveMasterKey(secret) {
  return crypto.createHash('sha256').update(String(secret), 'utf8').digest();
}

function getEncryptionKey() {
  const secret = process.env.SETTINGS_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) {
    const error = new Error('Payment credential encryption is not configured.');
    error.code = 'CREDENTIAL_VAULT_KEY_MISSING';
    throw error;
  }

  // Deriving a fixed 32-byte key supports either a generated encryption secret
  // or the legacy JWT_SECRET fallback without making assumptions about encoding.
  return deriveMasterKey(secret);
}

function getDecryptionKeys() {
  const previousSecrets = String(process.env.SETTINGS_ENCRYPTION_KEY_PREVIOUS || '')
    .split(',')
    .map((secret) => secret.trim())
    .filter(Boolean);
  const secrets = [
    process.env.SETTINGS_ENCRYPTION_KEY,
    ...previousSecrets,
    process.env.JWT_SECRET,
  ]
    .map((secret) => String(secret || ''))
    .filter(Boolean);

  if (secrets.length === 0) {
    const error = new Error('Payment credential encryption is not configured.');
    error.code = 'CREDENTIAL_VAULT_KEY_MISSING';
    throw error;
  }

  // JWT_SECRET was the original fallback. Trying it after the dedicated key
  // keeps existing ciphertext readable when SETTINGS_ENCRYPTION_KEY is added.
  return [...new Set(secrets)].map(deriveMasterKey);
}

function isEncryptedCredential(value) {
  return typeof value === 'string' && value.startsWith(`${PREFIX}:`);
}

function encryptCredential(value) {
  const plaintext = String(value ?? '').trim();
  if (!plaintext) return null;

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    PREFIX,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

function decryptCredential(value) {
  if (value === null || value === undefined || value === '') return '';
  const storedValue = String(value);

  // Existing installations stored Waafi keys as plaintext. Keep them readable
  // so admins can rotate them gradually through the encrypted write paths.
  if (!isEncryptedCredential(storedValue)) return storedValue;

  const parts = storedValue.split(':');
  if (parts.length !== 5 || parts[0] !== 'enc' || parts[1] !== 'v1') {
    const error = new Error('Stored payment credential is invalid.');
    error.code = 'CREDENTIAL_VAULT_FORMAT_INVALID';
    throw error;
  }

  try {
    const iv = Buffer.from(parts[2], 'base64url');
    const authTag = Buffer.from(parts[3], 'base64url');
    const ciphertext = Buffer.from(parts[4], 'base64url');
    if (iv.length !== IV_BYTES || authTag.length !== 16 || ciphertext.length === 0) {
      throw new Error('Invalid encrypted credential components.');
    }

    let lastError;
    for (const key of getDecryptionKeys()) {
      try {
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAAD(AAD);
        decipher.setAuthTag(authTag);
        return Buffer.concat([
          decipher.update(ciphertext),
          decipher.final(),
        ]).toString('utf8');
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('No credential decryption key is available.');
  } catch (cause) {
    const error = new Error('Stored payment credential could not be decrypted.');
    error.code = 'CREDENTIAL_VAULT_DECRYPT_FAILED';
    error.cause = cause;
    throw error;
  }
}

module.exports = {
  decryptCredential,
  encryptCredential,
  isEncryptedCredential,
};
