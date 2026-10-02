/// Shared Validator class for Flutter Mobile Applications
/// Provides static validation methods returning error strings or null.
class Validator {
  // Double-quoted raw string: the character class contains an apostrophe, which
  // would terminate a r'…' literal and leave the rest of the pattern as code.
  static final RegExp _emailRegExp = RegExp(
    r"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$",
  );

  static final RegExp _phoneRegExp = RegExp(
    r'^(\+?252|0)?[1-9]\d{7,8}$',
  );

  /// Validates required text field
  static String? required(String? value, [String fieldName = 'This field']) {
    if (value == null || value.trim().isEmpty) {
      return '$fieldName is required.';
    }
    return null;
  }

  /// Validates email address format
  static String? email(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Email address is required.';
    }
    if (!_emailRegExp.hasMatch(value.trim())) {
      return 'Please enter a valid email address.';
    }
    return null;
  }

  /// Validates phone number format
  static String? phone(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Phone number is required.';
    }
    final clean = value.trim().replaceAll(RegExp(r'[\s\-\(\)]'), '');
    if (!_phoneRegExp.hasMatch(clean) && clean.length < 8) {
      return 'Please enter a valid phone number (e.g. +252 61 5555555).';
    }
    return null;
  }

  /// Validates password complexity
  static String? password(String? value) {
    if (value == null || value.isEmpty) {
      return 'Password is required.';
    }
    if (value.length < 8) {
      return 'Password must be at least 8 characters long.';
    }
    if (!RegExp(r'[A-Z]').hasMatch(value)) {
      return 'Password must contain at least one uppercase letter.';
    }
    if (!RegExp(r'[a-z]').hasMatch(value)) {
      return 'Password must contain at least one lowercase letter.';
    }
    if (!RegExp(r'[0-9]').hasMatch(value)) {
      return 'Password must contain at least one number.';
    }
    if (!RegExp(r'[!@#$%^&*()_+\-=\[\]{};'':"\\|,.<>\/?]').hasMatch(value)) {
      return 'Password must contain at least one special character.';
    }
    return null;
  }

  /// Validates positive number (> 0)
  static String? positiveNumber(String? value, [String fieldName = 'Amount']) {
    if (value == null || value.trim().isEmpty) {
      return '$fieldName is required.';
    }
    final num = double.tryParse(value.trim());
    if (num == null || num <= 0) {
      return '$fieldName must be a valid number greater than 0.';
    }
    return null;
  }

  /// Validates non-negative number (>= 0)
  static String? nonNegativeNumber(String? value, [String fieldName = 'Quantity']) {
    if (value == null || value.trim().isEmpty) {
      return '$fieldName is required.';
    }
    final num = double.tryParse(value.trim());
    if (num == null || num < 0) {
      return '$fieldName cannot be negative.';
    }
    return null;
  }
}
