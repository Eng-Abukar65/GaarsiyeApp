const {
  generateFileHash,
  verifyMagicBytes,
  validateFilenameSecurity,
  sanitizeSvg,
} = require('../utils/fileSecurity');

const {
  validateNameField,
  validatePrice,
  validateQuantity,
  isValidPhone,
  isValidEmail,
  normalizePhone,
  validatePasswordStrength,
} = require('../utils/validationHelper');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passedTests++;
  } else {
    console.error(`  ✕ FAIL: ${message}`);
    failedTests++;
  }
}

async function runTests() {
  console.log('==================================================');
  console.log(' RUNNING GAARSIS ENTERPRISE VALIDATION TEST SUITE');
  console.log('==================================================\n');

  // 1. FILE HASHING & DUPLICATE PREVENTION TESTS
  console.log('[TEST GROUP 1] File Hashing & Security');
  const buffer1 = Buffer.from('TEST_FILE_CONTENT_12345');
  const buffer2 = Buffer.from('TEST_FILE_CONTENT_12345');
  const buffer3 = Buffer.from('DIFFERENT_FILE_CONTENT');

  const hash1 = generateFileHash(buffer1);
  const hash2 = generateFileHash(buffer2);
  const hash3 = generateFileHash(buffer3);

  assert(hash1 === hash2, 'Identical file content produces identical SHA-256 hash');
  assert(hash1 !== hash3, 'Different file content produces different SHA-256 hash');

  assert(validateFilenameSecurity('image.png'), 'Safe filename accepted');
  assert(!validateFilenameSecurity('image.png.exe'), 'Double extension image.png.exe rejected');
  assert(!validateFilenameSecurity('../etc/passwd'), 'Path traversal rejected');
  assert(!validateFilenameSecurity('file\0.png'), 'Null byte filename rejected');

  // 2. MAGIC BYTES & IMAGE FORMAT TESTS
  console.log('\n[TEST GROUP 2] Magic Bytes & Image Signatures');
  const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]);
  const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
  const fakeHeader = Buffer.from('THIS IS NOT AN IMAGE FILE');

  assert(verifyMagicBytes(pngHeader, '.png'), 'Valid PNG magic bytes detected');
  assert(verifyMagicBytes(jpegHeader, '.jpg'), 'Valid JPEG magic bytes detected');
  assert(!verifyMagicBytes(fakeHeader, '.png'), 'Fake PNG image content rejected');
  assert(!verifyMagicBytes(fakeHeader, '.jpg'), 'Fake JPEG image content rejected');

  const unsafeSvg = '<svg><script>alert("xss")</script><rect onload="alert(1)" /></svg>';
  const cleanSvg = sanitizeSvg(unsafeSvg);
  assert(!cleanSvg.includes('<script>'), 'SVG script tag sanitized');
  assert(!cleanSvg.includes('onload='), 'SVG inline event handler sanitized');

  // 3. NAME & TEXT FIELDS TESTS
  console.log('\n[TEST GROUP 3] Name & Text Fields');
  assert(validateNameField('Ahmed Ali', 'Full Name').isValid, '"Ahmed Ali" accepted');
  assert(validateNameField('Maryan Cabdi', 'Vendor Name').isValid, '"Maryan Cabdi" accepted');
  assert(validateNameField("O'Connor", 'Name').isValid, '"O\'Connor" accepted');
  assert(validateNameField('Ayaan-Abdi', 'Name').isValid, '"Ayaan-Abdi" accepted');

  assert(!validateNameField('123', 'Full Name').isValid, '"123" rejected');
  assert(!validateNameField('123456', 'Full Name').isValid, '"123456" rejected');
  assert(!validateNameField('0000', 'Full Name').isValid, '"0000" rejected');
  assert(
    validateNameField('123', 'Full Name').message === 'This field must contain letters and cannot contain only numbers.',
    'Exact error message returned for numbers-only name'
  );

  // 4. NUMERIC FIELDS TESTS
  console.log('\n[TEST GROUP 4] Numeric & Price Fields');
  assert(validatePrice('10.50', 'Price').isValid, 'Price 10.50 accepted');
  assert(validatePrice('0', 'Price').isValid, 'Price 0 accepted');
  assert(!validatePrice('-5', 'Price').isValid, 'Negative price -5 rejected');
  assert(!validatePrice('1e10', 'Price').isValid, 'Scientific notation 1e10 rejected');
  assert(!validatePrice('10abc', 'Price').isValid, 'Alphabetic price 10abc rejected');

  assert(validateQuantity('10', 'Stock').isValid, 'Quantity 10 accepted');
  assert(!validateQuantity('-10', 'Stock').isValid, 'Negative stock -10 rejected');
  assert(!validateQuantity('10.5', 'Stock').isValid, 'Decimal stock 10.5 rejected');

  // 5. PHONE & EMAIL TESTS
  console.log('\n[TEST GROUP 5] Phone & Email Validation');
  assert(isValidPhone('0613345902'), 'Phone 0613345902 accepted');
  assert(normalizePhone('0613345902') === '252613345902', 'Phone 0613345902 normalized to 252613345902');
  assert(!isValidPhone('abc613345902'), 'Phone with letters rejected');

  assert(isValidEmail('user@gaarsis.com'), 'Email user@gaarsis.com accepted');
  assert(!isValidEmail('invalid email@domain.com'), 'Email with spaces rejected');

  // 6. PASSWORD TESTS
  console.log('\n[TEST GROUP 6] Password Strength');
  assert(validatePasswordStrength('P@ssword123').isValid, 'Strong password accepted');
  assert(!validatePasswordStrength('weak').isValid, 'Short password rejected');

  console.log('\n==================================================');
  console.log(` RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('==================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests();
