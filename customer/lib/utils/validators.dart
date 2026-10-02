/// Reusable Flutter Form Validators for Gaarsis App Suite

class AppValidators {
  /// Validates Name fields (rejects numbers only)
  static String? validateName(String? value, {String label = 'Name', int minLength = 2, int maxLength = 100}) {
    if (value == null || value.trim().isEmpty) {
      return '$label is required.';
    }
    final trimmed = value.trim();
    if (RegExp(r'^\d+$').hasMatch(trimmed) || RegExp(r'^[0-9\s]+$').hasMatch(trimmed)) {
      return 'This field must contain letters and cannot contain only numbers.';
    }
    if (trimmed.length < minLength) {
      return '$label must be at least $minLength characters.';
    }
    if (trimmed.length > maxLength) {
      return '$label cannot exceed $maxLength characters.';
    }
    return null;
  }

  /// Validates Phone numbers
  static String? validatePhone(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Enter a valid phone number.';
    }
    if (RegExp(r'[a-zA-Z]').hasMatch(value)) {
      return 'Enter a valid phone number.';
    }
    final cleaned = value.replaceAll(RegExp(r'[\s\-\(\)\+]'), '');
    if (cleaned.length < 8 || cleaned.length > 15) {
      return 'Enter a valid phone number.';
    }
    return null;
  }

  /// Validates Email addresses
  static String? validateEmail(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Enter a valid email address.';
    }
    final trimmed = value.trim();
    final emailRegex = RegExp(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$');
    if (!emailRegex.hasMatch(trimmed)) {
      return 'Enter a valid email address.';
    }
    return null;
  }

  /// Validates Price fields
  static String? validatePrice(String? value, {String label = 'Price'}) {
    if (value == null || value.trim().isEmpty) {
      return '$label is required.';
    }
    final trimmed = value.trim();
    if (RegExp(r'[eEa-zA-Z-]').hasMatch(trimmed)) {
      return '$label must be greater than zero.';
    }
    final num = double.tryParse(trimmed);
    if (num == null || num < 0) {
      return '$label must be greater than or equal to zero.';
    }
    if (trimmed.contains('.') && trimmed.split('.')[1].length > 2) {
      return '$label cannot have more than 2 decimal places.';
    }
    return null;
  }

  /// Validates Quantity fields
  static String? validateQuantity(String? value, {String label = 'Quantity', int min = 0}) {
    if (value == null || value.trim().isEmpty) {
      return '$label is required.';
    }
    final trimmed = value.trim();
    if (RegExp(r'[eEa-zA-Z-\.]').hasMatch(trimmed)) {
      return '$label must be a whole number.';
    }
    final num = int.tryParse(trimmed);
    if (num == null || num < min) {
      return '$label must be a whole number >= $min.';
    }
    return null;
  }
}
