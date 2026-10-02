/**
 * Universal Backend Input Validation Helper
 * Provides strict, reusable validation logic for backend controllers and middleware.
 */

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Normalizes phone number into standard '2526XXXXXXXX' format.
 */
function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  let cleaned = phone.trim().replace(/[\s\-\(\)\+]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '252' + cleaned.slice(1);
  } else if (cleaned.length === 8 || cleaned.length === 9) {
    if (!cleaned.startsWith('252')) {
      cleaned = '252' + cleaned;
    }
  }
  return cleaned;
}

/**
 * Validates phone number format.
 */
function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  // Reject letters or invalid characters before normalization
  if (/[a-zA-Z]/.test(phone)) return false;
  const normalized = normalizePhone(phone);
  return /^\d{11,12}$/.test(normalized);
}

/**
 * Validates email format and length.
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.includes(' ') || trimmed.length > 255) return false;
  return EMAIL_REGEX.test(trimmed);
}

/**
 * Sanitizes text inputs by removing HTML tags and collapsing whitespace.
 */
function sanitizeText(text) {
  if (!text || typeof text !== 'string') return '';
  let clean = text.replace(/<[^>]*>?/gm, ''); // Strip HTML tags
  clean = clean.replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, ''); // Strip SQL/script injection chars if any
  return clean.trim().replace(/\s+/g, ' '); // Collapse spaces
}

/**
 * Validates Name and Text fields (e.g. Full Name, Vendor Name, City, etc.)
 */
function validateNameField(name, fieldName = 'Name', options = {}) {
  const minLength = options.minLength || 2;
  const maxLength = options.maxLength || 100;

  if (!name || typeof name !== 'string') {
    return { isValid: false, message: `${fieldName} is required.` };
  }

  const trimmed = name.trim();

  if (trimmed.length === 0) {
    return { isValid: false, message: `${fieldName} cannot be empty.` };
  }

  // Check if contains only numbers
  if (/^\d+$/.test(trimmed) || /^[0-9\s]+$/.test(trimmed)) {
    return { isValid: false, message: 'This field must contain letters and cannot contain only numbers.' };
  }

  // Check HTML/script tags
  if (/<[^>]*>/g.test(name)) {
    return { isValid: false, message: `${fieldName} contains invalid characters or HTML.` };
  }

  if (trimmed.length < minLength) {
    return { isValid: false, message: `${fieldName} must be at least ${minLength} characters.` };
  }

  if (trimmed.length > maxLength) {
    return { isValid: false, message: `${fieldName} cannot exceed ${maxLength} characters.` };
  }

  return { isValid: true, sanitized: sanitizeText(name) };
}

/**
 * Validates price fields (must be a finite non-negative number with max 2 decimal places, no scientific notation).
 */
function validatePrice(val, fieldName = 'Price') {
  if (val === null || val === undefined || val === '') {
    return { isValid: false, message: `${fieldName} is required.` };
  }

  const strVal = String(val).trim();

  // Reject letters, negative sign, scientific notation e.g. 1e10, NaN, Infinity
  if (/[eEa-zA-Z]/.test(strVal) || strVal.includes('-')) {
    return { isValid: false, message: `${fieldName} must be a valid positive number.` };
  }

  const num = Number(strVal);
  if (isNaN(num) || !isFinite(num) || num < 0) {
    return { isValid: false, message: `${fieldName} must be greater than or equal to zero.` };
  }

  // Max 2 decimal places check
  if (strVal.includes('.')) {
    const decimals = strVal.split('.')[1];
    if (decimals && decimals.length > 2) {
      return { isValid: false, message: `${fieldName} cannot have more than 2 decimal places.` };
    }
  }

  if (num > 1000000) {
    return { isValid: false, message: `${fieldName} exceeds the maximum allowed value.` };
  }

  return { isValid: true, value: num };
}

/**
 * Validates integer quantity or stock fields.
 */
function validateQuantity(val, fieldName = 'Quantity', options = {}) {
  const min = options.min !== undefined ? options.min : 0;
  const max = options.max || 100000;

  if (val === null || val === undefined || val === '') {
    return { isValid: false, message: `${fieldName} is required.` };
  }

  const strVal = String(val).trim();

  if (/[eEa-zA-Z\.]/.test(strVal) || strVal.includes('-')) {
    return { isValid: false, message: `${fieldName} must be a whole integer.` };
  }

  const num = Number(strVal);
  if (isNaN(num) || !isFinite(num) || !Number.isInteger(num) || num < min) {
    return { isValid: false, message: `${fieldName} must be a whole number greater than or equal to ${min}.` };
  }

  if (num > max) {
    return { isValid: false, message: `${fieldName} exceeds maximum allowed value of ${max}.` };
  }

  return { isValid: true, value: num };
}

/**
 * Validates password strength:
 * - Minimum 8 characters
 * - At least 1 uppercase letter (A-Z)
 * - At least 1 lowercase letter (a-z)
 * - At least 1 number (0-9)
 * - At least 1 special character (!@#$%^&* etc.)
 * - Max 128 characters
 */
function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return { isValid: false, message: 'Password is required.' };
  }
  if (password.length < 8) {
    return { isValid: false, message: 'Password must be at least 8 characters long.' };
  }
  if (password.length > 128) {
    return { isValid: false, message: 'Password cannot exceed 128 characters.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { isValid: false, message: 'Password must include at least one uppercase letter (A-Z).' };
  }
  if (!/[a-z]/.test(password)) {
    return { isValid: false, message: 'Password must include at least one lowercase letter (a-z).' };
  }
  if (!/[0-9]/.test(password)) {
    return { isValid: false, message: 'Password must include at least one number (0-9).' };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { isValid: false, message: 'Password must include at least one special character.' };
  }
  return { isValid: true };
}

/**
 * Validates text descriptions / notes.
 */
function validateDescription(text, fieldName = 'Description', minLength = 3, maxLength = 2000) {
  if (text === undefined || text === null) return { isValid: true, value: '' };
  
  if (typeof text !== 'string') {
    return { isValid: false, message: `${fieldName} must be text.` };
  }

  const trimmed = text.trim();
  if (trimmed.length > 0 && trimmed.length < minLength) {
    return { isValid: false, message: `${fieldName} must be at least ${minLength} characters.` };
  }
  if (trimmed.length > maxLength) {
    return { isValid: false, message: `${fieldName} cannot exceed ${maxLength} characters.` };
  }

  return { isValid: true, value: sanitizeText(text) };
}

/**
 * Validates strict enum / whitelist value.
 */
function isValidEnum(value, allowedList, fieldName = 'Field') {
  if (!allowedList || !Array.isArray(allowedList)) return false;
  return allowedList.includes(value);
}

/**
 * Validates ISO / standard date string.
 */
function isValidDate(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

module.exports = {
  normalizePhone,
  isValidPhone,
  isValidEmail,
  sanitizeText,
  validateNameField,
  validatePrice,
  validateQuantity,
  validatePasswordStrength,
  validateDescription,
  isValidEnum,
  isValidDate,
};
