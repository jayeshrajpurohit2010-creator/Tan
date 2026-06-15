import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const MAGIC = Buffer.from('TANENC1');
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

export type EncryptedBuffer = {
  bytes: Buffer;
  algorithm: 'aes-256-gcm';
  salt: string;
  iv: string;
  authTag: string;
};

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KEY_LENGTH, {
    cost: SCRYPT_COST,
    blockSize: SCRYPT_BLOCK_SIZE,
    parallelization: SCRYPT_PARALLELIZATION,
  });
}

export function encryptBuffer(plain: Buffer, passphrase: string): EncryptedBuffer {
  if (!passphrase || passphrase.length < 8) {
    throw new Error('Encryption passphrase is required and must be at least 8 characters.');
  }

  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    bytes: Buffer.concat([MAGIC, salt, iv, authTag, ciphertext]),
    algorithm: 'aes-256-gcm',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64')
  };
}

export function decryptBuffer(encrypted: Buffer, passphrase: string): Buffer {
  if (!encrypted.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('Invalid Tan encrypted payload.');
  }

  let offset = MAGIC.length;
  const salt = encrypted.subarray(offset, offset + SALT_LENGTH);
  offset += SALT_LENGTH;
  const iv = encrypted.subarray(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;
  const authTag = encrypted.subarray(offset, offset + TAG_LENGTH);
  offset += TAG_LENGTH;
  const ciphertext = encrypted.subarray(offset);
  const key = deriveKey(passphrase, salt);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
