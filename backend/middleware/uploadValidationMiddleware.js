const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const {
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  verifyMagicBytes,
  sanitizeSvg,
  generateFileHash,
  generateSecureFilename,
  validateFilenameSecurity,
} = require('../utils/fileSecurity');

let pool = null;
function getDbPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'gaarsisapp',
      port: process.env.DB_PORT || 3306,
      waitForConnections: true,
      connectionLimit: 10,
    });
  }
  return pool;
}

/**
 * Middleware factory for validating file uploads and preventing duplicate files.
 * @param {Object} options Options object: { maxSizeBytes, documentType }
 */
function createUploadValidator(options = {}) {
  const maxSizeBytes = options.maxSizeBytes || 10 * 1024 * 1024; // Default 10MB
  const documentType = options.documentType || 'general';

  return async (req, res, next) => {
    // If no file uploaded in request, proceed to next
    if (!req.file && !req.files) {
      return next();
    }

    const filesToProcess = req.files 
      ? (Array.isArray(req.files) ? req.files : Object.values(req.files).flat()) 
      : [req.file];

    const db = getDbPool();
    const userId = req.user?.id || req.user?.vendor_id || null;
    const vendorId = req.user?.vendor_id || req.body?.vendor_id || null;

    for (const file of filesToProcess) {
      if (!file) continue;

      const originalName = file.originalname || 'upload.png';
      
      // 1. Filename Security Check (Path traversal, null byte, double extension)
      if (!validateFilenameSecurity(originalName)) {
        cleanTempFile(file);
        return res.status(400).json({
          success: false,
          code: 'INVALID_FILENAME',
          message: 'Security error: Invalid or malicious filename detected.'
        });
      }

      // 2. Extension check
      const ext = path.extname(originalName).toLowerCase();
      if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
        cleanTempFile(file);
        return res.status(415).json({
          success: false,
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: 'Unsupported image format.'
        });
      }

      // 3. MIME type check
      const mime = (file.mimetype || '').toLowerCase();
      if (mime && !ALLOWED_MIME_TYPES.has(mime)) {
        cleanTempFile(file);
        return res.status(415).json({
          success: false,
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: 'Unsupported image format.'
        });
      }

      // 4. File Size check
      if (file.size > maxSizeBytes) {
        cleanTempFile(file);
        return res.status(413).json({
          success: false,
          code: 'FILE_TOO_LARGE',
          message: 'The image size exceeds the allowed limit.'
        });
      }

      // 5. Read Buffer & Verify Magic Bytes
      let buffer;
      try {
        if (file.buffer) {
          buffer = file.buffer;
        } else if (file.path && fs.existsSync(file.path)) {
          buffer = fs.readFileSync(file.path);
        } else {
          return res.status(400).json({
            success: false,
            code: 'FILE_CORRUPTED',
            message: 'The image file is corrupted.'
          });
        }
      } catch (err) {
        cleanTempFile(file);
        return res.status(400).json({
          success: false,
          code: 'FILE_CORRUPTED',
          message: 'The image file is corrupted.'
        });
      }

      // Check magic bytes / content signature
      const isSignatureValid = verifyMagicBytes(buffer, ext);
      if (!isSignatureValid) {
        cleanTempFile(file);
        return res.status(415).json({
          success: false,
          code: 'INVALID_IMAGE_CONTENT',
          message: 'The selected file is not a valid image.'
        });
      }

      // 6. SVG Sanitization
      if (ext === '.svg') {
        const sanitizedContent = sanitizeSvg(buffer.toString('utf8'));
        buffer = Buffer.from(sanitizedContent, 'utf8');
      }

      // 7. Generate SHA-256 Hash
      const fileHash = generateFileHash(buffer);

      // 8. Check Duplicate File Hash in Database
      try {
        let duplicateQuery = `
          SELECT id FROM uploaded_files 
          WHERE file_hash = ? 
            AND (
              (uploaded_by IS NOT NULL AND uploaded_by = ?)
              OR (vendor_id IS NOT NULL AND vendor_id = ? AND document_type = ?)
              OR (? IS NULL AND ? IS NULL)
            )
          LIMIT 1
        `;
        const [existing] = await db.query(duplicateQuery, [
          fileHash, 
          userId, 
          vendorId, 
          documentType, 
          userId, 
          vendorId
        ]);

        if (existing.length > 0) {
          cleanTempFile(file);
          return res.status(409).json({
            success: false,
            code: 'DUPLICATE_FILE',
            message: 'This file already exists.'
          });
        }

        // 9. Save file with safe random name
        const secureFilename = generateSecureFilename(originalName);
        const uploadsDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        const destinationPath = path.join(uploadsDir, secureFilename);
        fs.writeFileSync(destinationPath, buffer);

        // Clean temp file if Multer saved to disk
        cleanTempFile(file);

        // 10. Record in DB
        await db.query(
          `INSERT INTO uploaded_files (file_hash, file_name, original_name, mime_type, file_size, uploaded_by, vendor_id, document_type) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [fileHash, secureFilename, originalName, mime || 'image/png', buffer.length, userId, vendorId, documentType]
        );

        // Update file properties on req.file for route controllers to consume
        file.filename = secureFilename;
        file.path = destinationPath;
        file.destination = uploadsDir;
        file.file_hash = fileHash;
        file.size = buffer.length;

      } catch (err) {
        console.error('Error during file validation & duplicate check:', err);
        if (err.code === 'ER_DUP_ENTRY') {
          cleanTempFile(file);
          return res.status(409).json({
            success: false,
            code: 'DUPLICATE_FILE',
            message: 'This file already exists.'
          });
        }
        cleanTempFile(file);
        return res.status(500).json({
          success: false,
          code: 'UPLOAD_ERROR',
          message: 'An error occurred while validating the uploaded file.'
        });
      }
    }

    next();
  };
}

function cleanTempFile(file) {
  if (file && file.path && fs.existsSync(file.path)) {
    try {
      fs.unlinkSync(file.path);
    } catch (e) {
      // ignore
    }
  }
}

module.exports = {
  createUploadValidator,
  cleanTempFile,
};
