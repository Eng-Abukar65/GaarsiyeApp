const SECRET_KEY_PATTERN = /(api[_-]?key|api[_-]?user|merchant[_-]?uid|password|secret|token|authorization|credential)/i;
const ACCOUNT_KEY_PATTERN = /(account(?:[_-]?no)?|phone|mobile|msisdn)/i;

function maskSensitiveValue(value, visibleSuffix = 4) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const visible = Math.max(0, Math.min(Number(visibleSuffix) || 0, text.length));
  if (visible === 0) return '*'.repeat(Math.min(12, text.length));
  const hiddenLength = Math.max(1, text.length - visible);
  return `${'*'.repeat(Math.min(12, hiddenLength))}${text.slice(-visible)}`;
}

function redactSensitiveData(value, key = '', depth = 0) {
  if (depth > 8) return '[TRUNCATED]';
  if (SECRET_KEY_PATTERN.test(key)) return '[REDACTED]';
  if (ACCOUNT_KEY_PATTERN.test(key)) return maskSensitiveValue(value);
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item, '', depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      redactSensitiveData(childValue, childKey, depth + 1),
    ]));
  }
  return value;
}

module.exports = { maskSensitiveValue, redactSensitiveData };
