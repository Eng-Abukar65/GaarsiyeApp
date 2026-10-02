const {
  isValidEmail,
  isValidPhone,
  validateNameField,
  validatePrice,
  validateQuantity,
  validatePasswordStrength,
  validateDescription,
  isValidEnum,
  isValidDate,
  normalizePhone,
} = require('../utils/validationHelper');

/**
 * Higher-order middleware factory that runs field schema validations on req.body
 */
function validateSchema(schemaRules) {
  return (req, res, next) => {
    const errors = {};

    for (const [field, rules] of Object.entries(schemaRules)) {
      let rawVal = req.body[field];

      // Required check
      if (rules.required) {
        if (rawVal === undefined || rawVal === null || (typeof rawVal === 'string' && rawVal.trim() === '')) {
          errors[field] = rules.requiredMessage || `${field} is required.`;
          continue;
        }
      }

      // If value present, validate according to type/rule specs
      if (rawVal !== undefined && rawVal !== null && (typeof rawVal !== 'string' || rawVal.trim() !== '')) {
        // 1. Name / Text Validation
        if (rules.type === 'name') {
          const resName = validateNameField(rawVal, rules.label || field, rules.options || {});
          if (!resName.isValid) {
            errors[field] = resName.message;
          } else {
            req.body[field] = resName.sanitized;
          }
        }

        // 2. Email Validation
        if (rules.type === 'email') {
          if (!isValidEmail(rawVal)) {
            errors[field] = 'Enter a valid email address.';
          } else {
            req.body[field] = rawVal.trim().toLowerCase();
          }
        }

        // 3. Phone Validation
        if (rules.type === 'phone') {
          if (!isValidPhone(rawVal)) {
            errors[field] = 'Enter a valid phone number.';
          } else {
            req.body[field] = normalizePhone(rawVal);
          }
        }

        // 4. Password Validation
        if (rules.type === 'password') {
          const resPass = validatePasswordStrength(rawVal);
          if (!resPass.isValid) {
            errors[field] = resPass.message;
          }
        }

        // 5. Price / Money Validation
        if (rules.type === 'price') {
          const resPrice = validatePrice(rawVal, rules.label || field);
          if (!resPrice.isValid) {
            errors[field] = resPrice.message;
          } else {
            req.body[field] = resPrice.value;
          }
        }

        // 6. Quantity / Stock / Integer Validation
        if (rules.type === 'quantity' || rules.type === 'integer') {
          const resQty = validateQuantity(rawVal, rules.label || field, rules.options || {});
          if (!resQty.isValid) {
            errors[field] = resQty.message;
          } else {
            req.body[field] = resQty.value;
          }
        }

        // 7. Description / Textarea Validation
        if (rules.type === 'description') {
          const resDesc = validateDescription(rawVal, rules.label || field, rules.minLength || 3, rules.maxLength || 2000);
          if (!resDesc.isValid) {
            errors[field] = resDesc.message;
          } else {
            req.body[field] = resDesc.value;
          }
        }

        // 8. Enum Whitelist Validation
        if (rules.type === 'enum') {
          if (!isValidEnum(rawVal, rules.allowedValues)) {
            errors[field] = `Invalid ${rules.label || field}.`;
          }
        }

        // 9. Date Validation
        if (rules.type === 'date') {
          if (!isValidDate(rawVal)) {
            errors[field] = `Invalid date format for ${rules.label || field}.`;
          }
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors,
      });
    }

    next();
  };
}

// ── Specific Validation Schemas ──

const schemas = {
  // Vendor Registration & Profile Update
  vendorAuth: validateSchema({
    vendor_name: { type: 'name', label: 'Vendor Name', required: true, options: { minLength: 2, maxLength: 100 } },
    owner_name: { type: 'name', label: 'Owner Name', required: false, options: { minLength: 2, maxLength: 100 } },
    email: { type: 'email', required: true },
    phone: { type: 'phone', required: true },
    password: { type: 'password', required: true },
  }),

  // Product Creation & Update
  product: validateSchema({
    name: { type: 'name', label: 'Product Name', required: true, options: { minLength: 2, maxLength: 100 } },
    price: { type: 'price', label: 'Price', required: true },
    stock: { type: 'quantity', label: 'Stock', required: true, options: { min: 0 } },
    category: { type: 'name', label: 'Category', required: false },
    description: { type: 'description', label: 'Description', required: false, maxLength: 2000 },
  }),

  // Service Creation & Update (Car Wash / Services)
  service: validateSchema({
    name: { type: 'name', label: 'Service Name', required: true, options: { minLength: 2, maxLength: 100 } },
    price: { type: 'price', label: 'Service Price', required: true },
    duration: { type: 'integer', label: 'Duration (Minutes)', required: false, options: { min: 1, max: 1440 } },
    description: { type: 'description', label: 'Description', required: false, maxLength: 1000 },
  }),

  // Driver & Personnel Creation / Update
  driver: validateSchema({
    full_name: { type: 'name', label: 'Full Name', required: true, options: { minLength: 2, maxLength: 100 } },
    phone: { type: 'phone', required: true },
    email: { type: 'email', required: false },
    vehicle_type: { type: 'enum', label: 'Vehicle Type', allowedValues: ['motorcycle', 'car', 'van', 'truck', 'auto_rickshaw', 'other'], required: false },
    status: { type: 'enum', label: 'Status', allowedValues: ['active', 'inactive', 'busy', 'suspended'], required: false },
  }),

  // Supplier Creation & Update
  supplier: validateSchema({
    name: { type: 'name', label: 'Supplier Name', required: true, options: { minLength: 2, maxLength: 100 } },
    contact_person: { type: 'name', label: 'Contact Person', required: false },
    phone: { type: 'phone', required: false },
    email: { type: 'email', required: false },
  }),

  // Delivery Zone Creation / Update
  deliveryZone: validateSchema({
    zone_name: { type: 'name', label: 'Zone Name', required: true, options: { minLength: 2, maxLength: 100 } },
    delivery_fee: { type: 'price', label: 'Delivery Fee', required: true },
  }),

  // Offer / Promotion Creation
  offer: validateSchema({
    title: { type: 'name', label: 'Offer Title', required: true, options: { minLength: 2, maxLength: 100 } },
    discount_percentage: { type: 'price', label: 'Discount Percentage', required: false },
  }),

  // Checkout / Order Creation
  orderCheckout: validateSchema({
    customer_name: { type: 'name', label: 'Customer Name', required: true },
    phone: { type: 'phone', required: true },
    payment_method: { type: 'enum', label: 'Payment Method', allowedValues: ['evc_plus', 'waafi', 'bank_transfer', 'cash', 'other'], required: true },
  }),

  // Car Wash Booking
  booking: validateSchema({
    customer_name: { type: 'name', label: 'Customer Name', required: true },
    phone: { type: 'phone', required: true },
    booking_date: { type: 'date', label: 'Booking Date', required: true },
  }),
};

module.exports = {
  validateSchema,
  schemas,
};
