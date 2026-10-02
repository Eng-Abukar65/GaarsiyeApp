const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const DOCUMENT_ROOT = path.resolve(__dirname, '..', 'uploads', 'vendor-documents');
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);
const MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

function normalizeDocumentPath(requestedPath) {
  if (!requestedPath || typeof requestedPath !== 'string') {
    return null;
  }

  const trimmedPath = requestedPath.trim();
  if (!trimmedPath) {
    return null;
  }

  const relativePath = trimmedPath.replace(/^\/+/, '');
  const cleanPath = relativePath
    .replace(/^uploads\/vendor-documents\//, '')
    .replace(/^vendor-documents\//, '')
    .replace(/^uploads\//, '');
  const normalizedPath = path.normalize(cleanPath);

  if (!normalizedPath || normalizedPath === '.' || normalizedPath.startsWith('..')) {
    return null;
  }

  const fullPath = path.resolve(DOCUMENT_ROOT, normalizedPath);
  const relativeToRoot = path.relative(DOCUMENT_ROOT, fullPath);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    return null;
  }

  return fullPath;
}

async function ensureVendorCanAccess(req, vendorId) {
  if (!vendorId) {
    return false;
  }

  if (req.user?.role === 'admin') {
    return true;
  }

  if (req.user?.role !== 'vendor') {
    return false;
  }

  const currentVendorId = req.user?.vendor_id || req.user?.id;
  if (!currentVendorId) {
    return false;
  }

  if (Number(currentVendorId) !== Number(vendorId)) {
    return false;
  }

  return true;
}

async function verifyVendorDocumentAccess(req, documentPath, vendorId) {
  if (req.user?.role === 'admin') {
    return true;
  }

  if (req.user?.role !== 'vendor') {
    return false;
  }

  const resolvedVendorId = vendorId || req.user?.vendor_id || req.user?.id;
  if (!(await ensureVendorCanAccess(req, resolvedVendorId))) {
    return false;
  }

  if (!resolvedVendorId) {
    return false;
  }

  const [rows] = await db.query(
    `SELECT nira_id, government_patent, passport_number
     FROM vendors
     WHERE id = ?`,
    [resolvedVendorId]
  );

  if (rows.length === 0) {
    return false;
  }

  const ownedDocuments = [rows[0].nira_id, rows[0].government_patent, rows[0].passport_number]
    .filter(Boolean)
    .map((value) => String(value).replace(/^\/+/, '').replace(/^uploads\//, ''));

  const documentKey = String(documentPath || '')
    .replace(/^\/+/, '')
    .replace(/^uploads\//, '')
    .replace(/^vendor-documents\//, '');
  return ownedDocuments.includes(documentKey);
}

class DocumentController {
  static async previewDocument(req, res) {
    try {
      const requestedPath = req.query.path || req.query.file || req.query.url || '';
      const vendorId = req.query.vendorId || req.query.vendor_id || null;
      const documentPath = normalizeDocumentPath(requestedPath);

      if (!documentPath) {
        return res.status(400).json({ message: 'Invalid document path.' });
      }

      if (!fs.existsSync(documentPath)) {
        return res.status(404).json({ message: 'Document file not found on server.' });
      }

      const extension = path.extname(documentPath).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(extension)) {
        return res.status(415).json({ message: 'Unsupported file type.' });
      }

      const canAccess = await verifyVendorDocumentAccess(req, requestedPath, vendorId);
      if (!canAccess) {
        return res.status(403).json({ message: 'Access denied to this document.' });
      }

      const fileName = path.basename(documentPath);
      const mimeType = MIME_TYPES[extension] || 'application/octet-stream';

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      res.sendFile(documentPath);
    } catch (error) {
      console.error('Document preview error:', error);
      res.status(500).json({ message: 'Unable to preview document.' });
    }
  }

  static async downloadDocument(req, res) {
    try {
      const requestedPath = req.query.path || req.query.file || req.query.url || '';
      const vendorId = req.query.vendorId || req.query.vendor_id || null;
      const documentPath = normalizeDocumentPath(requestedPath);

      if (!documentPath) {
        return res.status(400).json({ message: 'Invalid document path.' });
      }

      if (!fs.existsSync(documentPath)) {
        return res.status(404).json({ message: 'Document file not found on server.' });
      }

      const extension = path.extname(documentPath).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(extension)) {
        return res.status(415).json({ message: 'Unsupported file type.' });
      }

      const canAccess = await verifyVendorDocumentAccess(req, requestedPath, vendorId);
      if (!canAccess) {
        return res.status(403).json({ message: 'Access denied to this document.' });
      }

      const fileName = path.basename(documentPath);
      const mimeType = MIME_TYPES[extension] || 'application/octet-stream';

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      res.download(documentPath, fileName);
    } catch (error) {
      console.error('Document download error:', error);
      res.status(500).json({ message: 'Unable to download document.' });
    }
  }
}

module.exports = DocumentController;
