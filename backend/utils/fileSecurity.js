const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Magic byte signatures for allowed image formats
const MAGIC_BYTES = {
  png: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  jpeg: [0xFF, 0xD8, 0xFF],
  gif: [0x47, 0x49, 0x46, 0x38], // GIF87a or GIF89a
  bmp: [0x42, 0x4D],
  tiff_le: [0x49, 0x49, 0x2A, 0x00],
  tiff_be: [0x4D, 0x4D, 0x00, 0x2A],
};

const ALLOWED_IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.heic', '.heif', '.tif', '.tiff', '.svg'
]);

const ALLOWED_MIME_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 
  'image/bmp', 'image/heic', 'image/heif', 'image/tiff', 'image/svg+xml'
]);

/**
 * Checks if the buffer starts with the target byte pattern.
 */
function bufferMatches(buffer, pattern) {
  if (buffer.length < pattern.length) return false;
  for (let i = 0; i < pattern.length; i++) {
    if (buffer[i] !== pattern[i]) return false;
  }
  return true;
}

/**
 * Validates magic bytes / file signature.
 */
function verifyMagicBytes(buffer, extension) {
  const ext = extension.toLowerCase();
  
  if (ext === '.png') {
    return bufferMatches(buffer, MAGIC_BYTES.png);
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    return bufferMatches(buffer, MAGIC_BYTES.jpeg);
  }
  if (ext === '.gif') {
    return bufferMatches(buffer, MAGIC_BYTES.gif);
  }
  if (ext === '.bmp') {
    return bufferMatches(buffer, MAGIC_BYTES.bmp);
  }
  if (ext === '.tif' || ext === '.tiff') {
    return bufferMatches(buffer, MAGIC_BYTES.tiff_le) || bufferMatches(buffer, MAGIC_BYTES.tiff_be);
  }
  if (ext === '.webp') {
    // RIFF....WEBP
    if (buffer.length < 12) return false;
    const isRiff = bufferMatches(buffer, [0x52, 0x49, 0x46, 0x46]);
    const isWebp = buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
    return isRiff && isWebp;
  }
  if (ext === '.heic' || ext === '.heif') {
    // Offset 4-7 is 'ftyp', offset 8-11 is 'heic'/'heix'/'mif1'/'msf1'
    if (buffer.length < 12) return false;
    const isFtyp = buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70;
    return isFtyp;
  }
  if (ext === '.svg') {
    const text = buffer.toString('utf8', 0, Math.min(buffer.length, 1000)).trim().toLowerCase();
    return text.includes('<svg') || text.includes('<?xml');
  }

  return false;
}

/**
 * Sanitizes SVG file content to strip scripts, event handlers, and external references.
 */
function sanitizeSvg(contentString) {
  let clean = contentString;
  // Remove <script> tags and contents
  clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Remove event handlers (e.g., onload=, onclick=, onerror=)
  clean = clean.replace(/\s*on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // Remove javascript: URLs
  clean = clean.replace(/href\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, 'href="#"');
  // Remove external DOCTYPE / ENTITY declarations to prevent XXE
  clean = clean.replace(/<!ENTITY[^>]*>/gi, '');
  clean = clean.replace(/<!DOCTYPE[^>]*>/gi, '');
  return clean;
}

/**
 * Generates SHA-256 hash for a given buffer or file path.
 */
function generateFileHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Generates a secure, random filename using UUID + extension.
 */
function generateSecureFilename(originalName) {
  const ext = path.extname(originalName || '').toLowerCase() || '.png';
  return `${crypto.randomUUID()}${ext}`;
}

/**
 * Validates filename against path traversal, null bytes, double extensions.
 */
function validateFilenameSecurity(filename) {
  if (!filename || typeof filename !== 'string') return false;
  if (filename.includes('\0')) return false; // Null byte
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) return false; // Path traversal
  
  // Check for executable double extension e.g. photo.png.exe
  const parts = filename.split('.');
  if (parts.length > 2) {
    const dangerousExts = ['exe', 'bat', 'cmd', 'sh', 'php', 'js', 'jar', 'vbs', 'ps1', 'cgi', 'pl'];
    const lastExt = parts[parts.length - 1].toLowerCase();
    if (dangerousExts.includes(lastExt)) return false;
  }

  return true;
}

module.exports = {
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  verifyMagicBytes,
  sanitizeSvg,
  generateFileHash,
  generateSecureFilename,
  validateFilenameSecurity,
};
