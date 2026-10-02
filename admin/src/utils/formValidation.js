/**
 * Frontend Validation Helpers for Admin Portal
 */

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

export function validatePhone(value) {
  if (!value || typeof value !== 'string') return 'Phone number is required.';
  if (/[a-zA-Z]/.test(value)) return 'Enter a valid phone number.';
  const cleaned = value.replace(/[\s\-\(\)\+]/g, '');
  if (cleaned.length < 8 || cleaned.length > 15) return 'Enter a valid phone number.';
  return null;
}

export function validateEmail(value) {
  if (!value || typeof value !== 'string') return 'Email is required.';
  const trimmed = value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return 'Enter a valid email address.';
  }
  return null;
}
