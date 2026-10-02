/**
 * Shared Admin Client-Side Form Validation Helpers
 */

export const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};

export const isValidPhone = (phone) => {
  if (!phone || typeof phone !== 'string') return false;
  const clean = phone.trim().replace(/[\s\-\(\)]/g, '');
  return /^(\+?252|0)?[1-9]\d{7,8}$/.test(clean) || clean.length >= 8;
};

export const isPositiveNumber = (val) => {
  if (val === null || val === undefined || val === '') return false;
  const num = Number(val);
  return !isNaN(num) && isFinite(num) && num > 0;
};

export const isNonNegativeNumber = (val) => {
  if (val === null || val === undefined || val === '') return false;
  const num = Number(val);
  return !isNaN(num) && isFinite(num) && num >= 0;
};

export const validateField = (fieldName, value, rules = {}) => {
  const strVal = String(value || '').trim();

  if (rules.required && !strVal) {
    return `${fieldName} is required.`;
  }
  if (rules.email && !isValidEmail(strVal)) {
    return 'Please enter a valid email address.';
  }
  if (rules.phone && !isValidPhone(strVal)) {
    return 'Please enter a valid phone number.';
  }
  if (rules.positiveNumber && !isPositiveNumber(strVal)) {
    return `${fieldName} must be a number greater than 0.`;
  }
  if (rules.nonNegativeNumber && !isNonNegativeNumber(strVal)) {
    return `${fieldName} cannot be negative.`;
  }
  if (rules.minLength && strVal.length < rules.minLength) {
    return `${fieldName} must be at least ${rules.minLength} characters.`;
  }
  return '';
};
