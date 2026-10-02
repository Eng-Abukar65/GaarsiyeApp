/**
 * Enterprise Form Validation Utility for Vendor & Admin Portals
 */

// ── New Direct Validation Helpers ──

export function validateName(value, label = 'Name', minLen = 2, maxLen = 100) {
  if (!value || typeof value !== 'string') return `${label} is required.`;
  const trimmed = value.trim();
  if (trimmed.length === 0) return `${label} cannot be empty.`;
  if (/^\d+$/.test(trimmed) || /^[0-9\s]+$/.test(trimmed)) {
    return 'This field must contain letters and cannot contain only numbers.';
  }
  if (trimmed.length < minLen) return `${label} must be at least ${minLen} characters.`;
  if (trimmed.length > maxLen) return `${label} cannot exceed ${maxLen} characters.`;
  return null;
}

export function validatePrice(value, label = 'Price') {
  if (value === undefined || value === null || String(value).trim() === '') {
    return `${label} is required.`;
  }
  const str = String(value).trim();
  if (/[eEa-zA-Z]/.test(str) || str.includes('-')) {
    return `${label} must be a positive number.`;
  }
  const num = Number(str);
  if (isNaN(num) || !isFinite(num) || num < 0) {
    return `${label} must be greater than or equal to zero.`;
  }
  if (str.includes('.') && str.split('.')[1].length > 2) {
    return `${label} cannot have more than 2 decimal places.`;
  }
  return null;
}

export function validateQuantity(value, label = 'Quantity', min = 0) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return `${label} is required.`;
  }
  const str = String(value).trim();
  if (/[eEa-zA-Z\.]/.test(str) || str.includes('-')) {
    return `${label} must be a whole integer.`;
  }
  const num = Number(str);
  if (isNaN(num) || !isFinite(num) || !Number.isInteger(num) || num < min) {
    return `${label} must be a whole number >= ${min}.`;
  }
  return null;
}

export function validatePhone(value) {
  if (!value || typeof value !== 'string') return 'Enter a valid phone number.';
  if (/[a-zA-Z]/.test(value)) return 'Enter a valid phone number.';
  const cleaned = value.replace(/[\s\-\(\)\+]/g, '');
  if (cleaned.length < 8 || cleaned.length > 15) return 'Enter a valid phone number.';
  return null;
}

export function validateEmail(value) {
  if (!value || typeof value !== 'string') return 'Enter a valid email address.';
  const trimmed = value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return 'Enter a valid email address.';
  }
  return null;
}

export function validateFileSelection(file, maxSizeBytes = 10 * 1024 * 1024) {
  if (!file) return 'Please select a file.';
  const allowedExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.heic', '.heif', '.tif', '.tiff', '.svg'];
  const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
  
  if (!allowedExts.includes(ext)) {
    return 'Unsupported image format.';
  }
  if (file.size > maxSizeBytes) {
    return 'The image size exceeds the allowed limit.';
  }
  return null;
}


// ── Legacy / Named Field Validator Helpers (vName, vEmail, vPhone, vRequired, etc.) ──

export function vRequired(value, label = 'Field') {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    return `${label} is required.`;
  }
  return null;
}

export function vName(value, label = 'Name') {
  return validateName(value, label, 2, 100);
}

export function vEmail(value, label = 'Email') {
  if (!value || typeof value !== 'string' || !value.trim()) {
    return `${label} is required.`;
  }
  return validateEmail(value);
}

export function vPhone(value, label = 'Phone Number') {
  if (!value || typeof value !== 'string' || !value.trim()) {
    return `${label} is required.`;
  }
  return validatePhone(value);
}

export function vPositive(value, label = 'Amount') {
  return validatePrice(value, label);
}

export function vNonNegative(value, label = 'Quantity') {
  return validateQuantity(value, label, 0);
}

export function vRange(value, label = 'Value', min = 0, max = 100) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return `${label} is required.`;
  }
  const num = Number(value);
  if (isNaN(num) || num < min || num > max) {
    return `${label} must be between ${min} and ${max}.`;
  }
  return null;
}

/**
 * Builds an error map from an array of validator functions or rules object.
 */
export function buildErrors(rules = {}) {
  const errors = {};
  for (const [field, validators] of Object.entries(rules)) {
    const list = Array.isArray(validators) ? validators : [validators];
    for (const fn of list) {
      if (typeof fn === 'function') {
        const err = fn();
        if (err) {
          errors[field] = err;
          break;
        }
      }
    }
  }
  return errors;
}
