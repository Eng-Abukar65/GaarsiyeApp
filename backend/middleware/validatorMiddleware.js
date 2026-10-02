/**
 * Express Middleware for Input Validation
 */

const { isValidEmail, isValidPhone, isPositiveNumber, isNonNegativeNumber } = require('../utils/validationHelper');

/**
 * Middleware factory requiring specific non-empty fields in req.body.
 */
function requireFields(fieldNames = []) {
  return (req, res, next) => {
    const missing = [];
    for (const name of fieldNames) {
      const val = req.body[name];
      if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
        missing.push(name);
      }
    }
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required field(s): ${missing.join(', ')}`,
        missingFields: missing
      });
    }
    next();
  };
}

/**
 * Middleware validating numeric fields in req.body.
 */
function validateNumericFields(fields = []) {
  return (req, res, next) => {
    for (const { name, min, positive } of fields) {
      const val = req.body[name];
      if (val !== undefined && val !== null && val !== '') {
        if (positive && !isPositiveNumber(val)) {
          return res.status(400).json({
            success: false,
            message: `Field '${name}' must be a valid number greater than 0.`
          });
        }
        if (min !== undefined && !isNonNegativeNumber(val)) {
          return res.status(400).json({
            success: false,
            message: `Field '${name}' must be a valid non-negative number.`
          });
        }
      }
    }
    next();
  };
}

module.exports = {
  requireFields,
  validateNumericFields,
};
