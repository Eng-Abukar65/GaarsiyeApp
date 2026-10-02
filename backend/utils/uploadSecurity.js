const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ─── Upload security ──────────────────────────────────────────────────────────
// Uploaded files are accepted only when the FILE CONTENT itself proves the type.
//
// Why content and not headers: multer's `fileFilter` only ever sees the client's
// `Content-Type` header and the client's filename — both fully attacker
// controlled. Validating those alone lets a webshell through as `image/png`.
//
// Strategy: buffer the upload in memory, verify its magic bytes, cross-check the
// declared extension and MIME against the DETECTED type, scan for embedded
// script/executable payloads, and only then write it to disk under a
// cryptographically random filename with an extension derived from the detected
// type. Nothing unverified is ever persisted.

// Byte signatures for the only types we accept anywhere.
const SIGNATURES = [
  { type: 'pdf',  ext: '.pdf',  mime: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { type: 'jpg',  ext: '.jpg',  mime: 'image/jpeg',      magic: [0xff, 0xd8, 0xff] },
  { type: 'png',  ext: '.png',  mime: 'image/png',       magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // WEBP is RIFF....WEBP — bytes 0-3 and 8-11.
  { type: 'webp', ext: '.webp', mime: 'image/webp',
    magic: [0x52, 0x49, 0x46, 0x46], extra: { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] } },
];

// Extensions that must never be stored, whatever the content claims to be.
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.sql', '.js', '.mjs', '.cjs', '.php', '.php3', '.php4', '.php5', '.phtml',
  '.bat', '.cmd', '.com', '.zip', '.rar', '.7z', '.tar', '.gz', '.html', '.htm',
  '.svg', '.sh', '.bash', '.ps1', '.jar', '.war', '.dll', '.so', '.py', '.rb', '.pl',
  '.asp', '.aspx', '.jsp', '.cgi', '.msi', '.apk', '.vbs', '.scr', '.hta',
]);

// Signatures of things that are definitely NOT documents/images.
const DANGEROUS_MAGIC = [
  { label: 'Windows executable', bytes: [0x4d, 0x5a] },                     // MZ
  { label: 'ELF executable',     bytes: [0x7f, 0x45, 0x4c, 0x46] },         // \x7FELF
  { label: 'ZIP/Office archive', bytes: [0x50, 0x4b, 0x03, 0x04] },         // PK..
  { label: 'ZIP archive',        bytes: [0x50, 0x4b, 0x05, 0x06] },
  { label: 'RAR archive',        bytes: [0x52, 0x61, 0x72, 0x21] },         // Rar!
  { label: 'Shell script',       bytes: [0x23, 0x21] },                     // #!
];

// Textual payloads that indicate an active-content polyglot hidden in a file
// that otherwise looks like an image or PDF.
const DANGEROUS_PATTERNS = [
  { label: 'PHP code',      re: /<\?php|<\?=/i },
  { label: 'script tag',    re: /<script[\s>]/i },
  { label: 'SVG markup',    re: /<svg[\s>]/i },
  { label: 'HTML document', re: /<!doctype\s+html|<html[\s>]/i },
  { label: 'server-side include', re: /<%[@=\s]/ },
];

class UploadValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UploadValidationError';
    this.statusCode = 400;
  }
}

const startsWith = (buffer, bytes, offset = 0) => {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buffer[offset + i] === b);
};

// Identify a buffer purely from its content. Returns a SIGNATURES entry or null.
function detectType(buffer) {
  for (const sig of SIGNATURES) {
    if (!startsWith(buffer, sig.magic)) continue;
    if (sig.extra && !startsWith(buffer, sig.extra.bytes, sig.extra.offset)) continue;
    return sig;
  }
  return null;
}

// Reject archives/executables/scripts and active-content polyglots.
function assertNotDangerous(buffer, originalName) {
  for (const d of DANGEROUS_MAGIC) {
    if (startsWith(buffer, d.bytes)) {
      throw new UploadValidationError(`"${originalName}" looks like a ${d.label} and was rejected.`);
    }
  }
  // Only the head matters for polyglots; keep it bounded for large files.
  const head = buffer.slice(0, 8192).toString('latin1');
  for (const p of DANGEROUS_PATTERNS) {
    if (p.re.test(head)) {
      throw new UploadValidationError(`"${originalName}" contains embedded ${p.label} and was rejected.`);
    }
  }
}

function safeFilename(prefix, ext) {
  // Extension comes from the DETECTED type, never from the client's filename,
  // so a crafted name can neither pick the extension nor traverse directories.
  return `${prefix}-${Date.now()}-${crypto.randomBytes(16).toString('hex')}${ext}`;
}

/**
 * Validates one buffered file and writes it to disk.
 * @returns {{filename:string, path:string, mime:string, size:number}}
 */
function validateAndPersist(file, { destination, prefix, allowed, maxBytes }) {
  const originalName = String(file.originalname || 'file');

  if (!file.buffer || file.buffer.length === 0) {
    throw new UploadValidationError(`"${originalName}" is empty.`);
  }
  if (file.buffer.length > maxBytes) {
    throw new UploadValidationError(
      `"${originalName}" is larger than the ${Math.round(maxBytes / 1024 / 1024)}MB limit.`
    );
  }

  // 1. Declared extension must not be on the blocklist (defence in depth: even a
  //    genuine PNG must not be stored as evil.php).
  const declaredExt = path.extname(originalName).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(declaredExt)) {
    throw new UploadValidationError(`Files of type "${declaredExt}" are not allowed.`);
  }

  // 2. Content must not be an executable/archive/script or contain active content.
  assertNotDangerous(file.buffer, originalName);

  // 3. Content must positively identify as one of the allowed types.
  const detected = detectType(file.buffer);
  if (!detected) {
    throw new UploadValidationError(
      `"${originalName}" is not a valid ${allowed.join(', ').toUpperCase()} file.`
    );
  }
  if (!allowed.includes(detected.type)) {
    throw new UploadValidationError(
      `"${originalName}" is a ${detected.type.toUpperCase()} file; only ${allowed.join(', ').toUpperCase()} are accepted here.`
    );
  }

  // 4. The declared extension must agree with the detected content. Blocks the
  //    `evil.pngx` / `shell.pdf` style mismatches the old regex let through.
  const extAliases = { jpg: ['.jpg', '.jpeg'], png: ['.png'], pdf: ['.pdf'], webp: ['.webp'] };
  if (declaredExt && !extAliases[detected.type].includes(declaredExt)) {
    throw new UploadValidationError(
      `"${originalName}" claims to be "${declaredExt}" but its contents are ${detected.type.toUpperCase()}.`
    );
  }

  fs.mkdirSync(destination, { recursive: true });
  const filename = safeFilename(prefix, detected.ext);
  const fullPath = path.join(destination, filename);
  // 0o640: readable by the app/group, never world-readable or executable.
  fs.writeFileSync(fullPath, file.buffer, { mode: 0o640 });

  return { filename, path: fullPath, mime: detected.mime, size: file.buffer.length };
}

/**
 * Builds a hardened uploader.
 *
 * @param {object} opts
 * @param {string} opts.destination directory to write into
 * @param {string} opts.prefix      filename prefix
 * @param {string[]} opts.allowed   allowed detected types e.g. ['pdf','jpg','png']
 * @param {number} opts.maxBytes    hard size cap
 */
function secureUpload(opts) {
  const config = {
    destination: opts.destination,
    prefix: opts.prefix || 'file',
    allowed: opts.allowed || ['jpg', 'png'],
    maxBytes: opts.maxBytes || 5 * 1024 * 1024,
  };

  // Buffer in memory so nothing unverified reaches the disk. multer still
  // enforces the byte cap so a huge upload is cut off early.
  const memory = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxBytes, files: 10, fields: 50 },
  });

  // Turns buffered files into verified files on disk, shaped exactly like
  // multer's diskStorage output so existing controllers keep working.
  const persist = (req, res, next) => {
    try {
      const written = [];
      const handle = (file) => {
        const result = validateAndPersist(file, config);
        written.push(result.path);
        file.filename = result.filename;
        file.path = result.path;
        file.destination = config.destination;
        file.mimetype = result.mime; // trusted: derived from content
        delete file.buffer;
      };

      try {
        if (req.file) handle(req.file);
        if (Array.isArray(req.files)) req.files.forEach(handle);
        else if (req.files && typeof req.files === 'object') {
          Object.values(req.files).flat().forEach(handle);
        }
      } catch (err) {
        // Roll back anything already written for this request.
        written.forEach((p) => { try { fs.unlinkSync(p); } catch { /* ignore */ } });
        throw err;
      }
      next();
    } catch (err) {
      next(err);
    }
  };

  return {
    single: (field) => [memory.single(field), persist],
    fields: (defs) => [memory.fields(defs), persist],
    array: (field, max) => [memory.array(field, max), persist],
  };
}

// Express error handler that turns upload failures into clean 400s instead of
// unhandled 500s with stack traces.
function uploadErrorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: 'That file is too large.',
      LIMIT_FILE_COUNT: 'Too many files were uploaded.',
      LIMIT_UNEXPECTED_FILE: `Unexpected file field "${err.field}".`,
    };
    return res.status(400).json({
      success: false,
      code: err.code,
      message: messages[err.code] || 'The upload was rejected.',
    });
  }
  if (err instanceof UploadValidationError || err?.name === 'UploadValidationError') {
    return res.status(400).json({ success: false, code: 'INVALID_UPLOAD', message: err.message });
  }
  return next(err);
}

module.exports = {
  secureUpload,
  uploadErrorHandler,
  UploadValidationError,
  // exported for tests
  detectType,
  assertNotDangerous,
  validateAndPersist,
  BLOCKED_EXTENSIONS,
};
