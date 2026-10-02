const DEFAULT_API_URL = 'https://api.waafipay.net/asm';
const DEFAULT_TIMEOUT_MS = 8000;

function getWaafiApiUrl() {
  return String(process.env.HURMOOD_API_URL || '').trim() || DEFAULT_API_URL;
}

function getWaafiTimeoutMs() {
  const configured = Number.parseInt(process.env.HURMOOD_TIMEOUT_MS, 10);
  return Number.isInteger(configured) && configured > 0 && configured <= 300000
    ? configured
    : DEFAULT_TIMEOUT_MS;
}

// How long an unresolved payment attempt blocks a retry. Inside this window the
// provider may still answer, so retrying risks a double charge. Past it, the
// request is treated as never having reached the provider and the customer is
// allowed to try again — otherwise one dropped connection locks them out
// permanently. Kept comfortably above the request timeout.
const DEFAULT_PENDING_BLOCK_MS = 120000; // 2 minutes

function getPendingBlockMs() {
  const configured = Number.parseInt(process.env.HURMOOD_PENDING_BLOCK_MS, 10);
  return Number.isInteger(configured) && configured >= 30000 && configured <= 900000
    ? configured
    : DEFAULT_PENDING_BLOCK_MS;
}

module.exports = {
  DEFAULT_API_URL,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_PENDING_BLOCK_MS,
  getWaafiApiUrl,
  getWaafiTimeoutMs,
  getPendingBlockMs,
};
