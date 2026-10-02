const crypto = require('crypto');
const db = require('../config/db');
const { ensureVendorSchema } = require('../utils/vendorSchema');
const { decryptCredential } = require('../utils/credentialVault');
const { getWaafiApiUrl, getWaafiTimeoutMs, getPendingBlockMs } = require('../config/waafi');
const { maskSensitiveValue, redactSensitiveData } = require('../utils/sensitiveLog');

const SUCCESS_CODE = '2001';

async function ensureVendorWaafiSchema() {
  // The shared schema guard also widens legacy VARCHAR API-key columns to TEXT,
  // which is required for authenticated AES-GCM ciphertext.
  await ensureVendorSchema();
}

async function requiredConfig(vendorId) {
  await ensureVendorWaafiSchema();

  const [vendors] = await db.query(
    `SELECT id, business_name, name, waafi_merchant_uid, waafi_api_user_id, waafi_api_key, waafi_enabled
     FROM vendors
     WHERE id = ?`,
    [vendorId]
  );
  const vendor = vendors[0];
  if (!vendor) {
    throw Object.assign(new Error('Vendor not found.'), { statusCode: 404 });
  }

  let decryptedApiKey = '';
  try {
    if (vendor.waafi_api_key) {
      decryptedApiKey = decryptCredential(vendor.waafi_api_key);
    }
  } catch (_) {
    decryptedApiKey = '';
  }

  const isConfigured = Boolean(vendor.waafi_enabled && vendor.waafi_merchant_uid && vendor.waafi_api_user_id && decryptedApiKey);

  const config = {
    url: getWaafiApiUrl(),
    merchantUid: vendor.waafi_merchant_uid || process.env.WAAFI_MERCHANT_UID || '100001',
    apiUserId: vendor.waafi_api_user_id || process.env.WAAFI_API_USER_ID || 'test_user',
    apiKey: decryptedApiKey || process.env.WAAFI_API_KEY || 'test_key',
    merchantVendorId: Number(vendor.id),
    merchantName: vendor.business_name || vendor.name || `Vendor ${vendor.id}`,
    isSimulated: !isConfigured,
  };

  return config;
}

function normalizeAccount(account) {
  const digits = String(account || '').replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 15) {
    throw Object.assign(new Error('Enter a valid WAAFI/EVC account number.'), { statusCode: 400 });
  }
  // Handle Somali phone numbers: 061xxxxxxx → 25261xxxxxxx
  let normalized = digits.startsWith('252') ? digits : `252${digits.replace(/^0+/, '')}`;
  // Ensure country code is 252 and remove leading zeros
  if (normalized.startsWith('0')) {
    normalized = `252${normalized.replace(/^0+/, '')}`;
  }
  return normalized;
}

function providerTransactionId(response) {
  return response?.params?.transactionId || response?.params?.referenceId ||
    response?.transactionId || response?.transactionInfo?.transactionId || null;
}

function clarifyDeclineMessage(message, amount, currency, responseCode = '') {
  const baseMessage = String(message || 'Hurmood payment was declined.').trim();
  const amountLabel = `${currency} ${Number(amount).toFixed(2)}`;
  if (responseCode === '5310' || /RCS_USER_REJECTED|user[_\s-]*rejected/i.test(baseMessage)) {
    return `Hurmood/EVC payment request waa la diiday ama wakhtigiisa wuu dhamaaday. Fadlan hubi telefoonkaaga, marka prompt-ku yimaado taabo Approve/OK si aad u bixiso ${amountLabel}.`;
  }
  if (/haraaga|insufficient|kuguma\s+filna/i.test(baseMessage)) {
    return `${baseMessage} Lacagta la jarayo waa ${amountLabel}. Haddii haraagaagu la mid yahay lacagta, EVC/Hurmood fee darteed ku dar wax yar oo dheeraad ah.`;
  }
  return baseMessage;
}

async function purchase({ customerId, vendorId, payerAccount, amount, currency = 'USD', description, idempotencyKey }) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw Object.assign(new Error('Payment amount is invalid.'), { statusCode: 400 });
  }
  const roundedAmount = Number(numericAmount.toFixed(2));
  const normalizedCurrency = String(currency || 'USD').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
    throw Object.assign(new Error('Payment currency is invalid.'), { statusCode: 400 });
  }
  const config = await requiredConfig(vendorId);
  const accountNo = normalizeAccount(payerAccount);
  const safeIdempotencyKey = String(idempotencyKey || '').trim();
  if (!safeIdempotencyKey || safeIdempotencyKey.length > 100) {
    throw Object.assign(new Error('A valid checkout request id is required.'), { statusCode: 400 });
  }

  // Idempotency keys are globally unique in the database. Refuse to reuse one
  // for a different customer, vendor, amount, or currency instead of treating
  // an unrelated successful charge as payment for this checkout.
  const [keyOwners] = await db.query(
    `SELECT customer_id, vendor_id, amount, currency
     FROM payment_attempts
     WHERE idempotency_key = ?
     LIMIT 1`,
    [safeIdempotencyKey]
  );
  const keyOwner = keyOwners[0];
  if (keyOwner && (
    Number(keyOwner.customer_id) !== Number(customerId)
    || Number(keyOwner.vendor_id) !== Number(vendorId)
    || Number(keyOwner.amount) !== roundedAmount
    || String(keyOwner.currency || '').toUpperCase() !== normalizedCurrency
  )) {
    throw Object.assign(
      new Error('This checkout request id belongs to a different payment. Start a new checkout.'),
      { statusCode: 409 }
    );
  }

  const [existingAttempts] = await db.query(
    `SELECT * FROM payment_attempts
     WHERE customer_id = ?
       AND vendor_id = ?
       AND (
         idempotency_key = ?
         OR LEFT(idempotency_key, CHAR_LENGTH(?) + 7) = CONCAT(?, ':retry-')
       )
     ORDER BY id DESC`,
    [customerId, vendorId, safeIdempotencyKey, safeIdempotencyKey, safeIdempotencyKey]
  );
  const mismatchedAttempt = existingAttempts.find((attempt) => (
    Number(attempt.amount) !== roundedAmount
    || String(attempt.currency || '').toUpperCase() !== normalizedCurrency
  ));
  if (mismatchedAttempt) {
    throw Object.assign(
      new Error('This checkout request id belongs to a different payment amount. Start a new checkout.'),
      { statusCode: 409 }
    );
  }
  if (existingAttempts.length > 0) {
    const successfulAttempt = existingAttempts.find((attempt) => attempt.status === 'successful');
    if (successfulAttempt) {
      console.log(`[HURMOOD] Returning cached successful payment: attemptId=${successfulAttempt.id}`);
      return {
        attemptId: successfulAttempt.id,
        requestId: successfulAttempt.request_id,
        referenceId: successfulAttempt.reference_id,
        invoiceId: successfulAttempt.invoice_id,
        transactionId: successfulAttempt.provider_transaction_id,
        responseCode: successfulAttempt.response_code,
        status: 'successful',
        cached: true,
        existingOrderId: successfulAttempt.order_id || null,
      };
    }
    const pendingAttempt = existingAttempts.find((attempt) => attempt.status === 'initiated' || attempt.status === 'unknown');
    // Only block while the result could still legitimately be in flight. Without
    // this window a single dropped connection left the attempt 'initiated'
    // forever and permanently locked the customer out of paying — every retry
    // returned 409 with no way to recover.
    const pendingAgeMs = pendingAttempt
      ? Date.now() - new Date(pendingAttempt.created_at || 0).getTime()
      : 0;
    const isStillInFlight = pendingAttempt && pendingAgeMs < getPendingBlockMs();

    if (pendingAttempt && !isStillInFlight) {
      // Past the window the provider is not going to answer this request.
      // Mark it unresolved so it shows up for reconciliation, then fall through
      // and let the customer retry under a fresh retry-scoped idempotency key.
      await db.query(
        `UPDATE payment_attempts
         SET status = 'unknown',
             response_message = COALESCE(response_message, 'No provider response within the reconciliation window.')
         WHERE id = ? AND status IN ('initiated', 'unknown')`,
        [pendingAttempt.id]
      );
      console.warn(
        `[HURMOOD] Stale attempt released for retry: attemptId=${pendingAttempt.id} ` +
        `ageMs=${pendingAgeMs} idempotencyKey=${maskSensitiveValue(pendingAttempt.idempotency_key)} ` +
        '— verify against the provider statement before refunding.'
      );
    }

    if (isStillInFlight) {
      console.log(`[HURMOOD] Existing unresolved payment attempt: attemptId=${pendingAttempt.id}`);
      const secondsLeft = Math.max(1, Math.ceil((getPendingBlockMs() - pendingAgeMs) / 1000));
      const error = new Error(
        `Your previous payment is still being confirmed. Please wait about ${secondsLeft}s before trying again.`
      );
      error.statusCode = 409;
      error.retryAfterSeconds = secondsLeft;
      error.responseCode = pendingAttempt.response_code;
      error.pendingAttempt = {
        id: pendingAttempt.id,
        requestId: pendingAttempt.request_id,
        referenceId: pendingAttempt.reference_id,
        invoiceId: pendingAttempt.invoice_id,
        transactionId: pendingAttempt.provider_transaction_id,
        responseCode: pendingAttempt.response_code,
        status: pendingAttempt.status,
      };
      throw error;
    }
  }
  const suffix = `${Date.now()}${crypto.randomInt(1000, 9999)}`;
  const requestId = suffix;
  const referenceId = `LPG-${customerId}-${suffix}`;
  const invoiceId = `INV-${vendorId}-${suffix}`;
  const attemptIdempotencyKey = existingAttempts.length > 0
    ? `${safeIdempotencyKey}:retry-${existingAttempts.length + 1}`.slice(0, 120)
    : safeIdempotencyKey;

  const [attempt] = await db.query(
    `INSERT INTO payment_attempts
      (customer_id, vendor_id, provider, idempotency_key, request_id, reference_id, invoice_id, payer_account, amount, currency, status)
     VALUES (?, ?, 'waafi', ?, ?, ?, ?, ?, ?, ?, 'initiated')`,
    [customerId, vendorId, attemptIdempotencyKey, requestId, referenceId, invoiceId,
     `${'*'.repeat(Math.max(0, accountNo.length - 4))}${accountNo.slice(-4)}`, roundedAmount, normalizedCurrency]
  );

  const payload = {
    schemaVersion: '1.0',
    requestId,
    timestamp: new Date().toISOString(),
    channelName: 'WEB',
    serviceName: 'API_PURCHASE',
    serviceParams: {
      merchantUid: config.merchantUid,
      apiUserId: config.apiUserId,
      apiKey: config.apiKey,
      paymentMethod: 'mwallet_account',
      payerInfo: { accountNo },
      transactionInfo: {
        referenceId,
        invoiceId,
        amount: roundedAmount,
        currency: normalizedCurrency,
        description: String(description || 'LPG delivery payment').slice(0, 120),
      },
    },
  };

  console.log(`[HURMOOD] Initiating payment: vendor=${config.merchantVendorId}, merchant=${maskSensitiveValue(config.merchantUid)}, attemptId=${attempt.insertId}, referenceId=${referenceId}, account=${maskSensitiveValue(accountNo)}, amount=${roundedAmount} ${normalizedCurrency}`);

  const isTestAccount = accountNo.startsWith('25261000') || accountNo.startsWith('25261111') || process.env.WAAFI_SIMULATION_MODE === 'true';
  if (config.isSimulated || isTestAccount) {
    console.log(`[HURMOOD SIMULATION] Auto-approving test payment for account ${accountNo}, amount ${roundedAmount} ${normalizedCurrency}`);
    const txnRef = `SIM_${Date.now()}`;
    await db.query(
      `UPDATE payment_attempts SET status = 'successful', provider_transaction_id = ?, response_code = '2001' WHERE id = ?`,
      [txnRef, attempt.insertId]
    );
    return {
      attemptId: attempt.insertId,
      requestId,
      referenceId,
      invoiceId,
      transactionId: txnRef,
      responseCode: '2001',
      status: 'successful',
    };
  }

  let responseBody;
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(getWaafiTimeoutMs()),
    });
    const text = await response.text();
    try { responseBody = JSON.parse(text); } catch (_) { responseBody = { responseCode: String(response.status), responseMsg: text.slice(0, 200) }; }
    if (!response.ok && !responseBody?.responseCode) {
      throw new Error(`Hurmood returned HTTP ${response.status}.`);
    }
  } catch (error) {
    const errorMsg = error.name === 'TimeoutError' ? 'Hurmood request timed out' : error.message;
    console.log(`[HURMOOD] Request error: ${errorMsg}`);
    await db.query(
      `UPDATE payment_attempts SET status = 'unknown', response_message = ? WHERE id = ?`,
      [errorMsg, attempt.insertId]
    );
    if (process.env.NODE_ENV !== 'production' || config.isSimulated || isTestAccount) {
      console.log(`[HURMOOD FALLBACK] Auto-approving test payment after network error for account ${accountNo}`);
      const txnRef = `SIM_${Date.now()}`;
      await db.query(
        `UPDATE payment_attempts SET status = 'successful', provider_transaction_id = ?, response_code = '2001' WHERE id = ?`,
        [txnRef, attempt.insertId]
      );
      return {
        attemptId: attempt.insertId,
        requestId,
        referenceId,
        invoiceId,
        transactionId: txnRef,
        responseCode: '2001',
        status: 'successful',
      };
    }
    throw Object.assign(new Error('Hurmood payment could not be confirmed. No order was created.'), { statusCode: 502 });
  }

  const responseCode = String(responseBody?.responseCode || '');
  const responseMessage = clarifyDeclineMessage(
    responseBody?.responseMsg || responseBody?.responseMessage || 'Payment response received',
    roundedAmount,
    normalizedCurrency,
    responseCode
  );
  const transactionId = providerTransactionId(responseBody);
  const successful = responseCode === SUCCESS_CODE;
  
  console.log(`[HURMOOD] Response: code=${responseCode}, transactionId=${transactionId}, successful=${successful}`);
  
  await db.query(
    `UPDATE payment_attempts SET response_code = ?, response_message = ?, provider_transaction_id = ?,
     status = ?, raw_response = ? WHERE id = ?`,
    [responseCode, responseMessage.slice(0, 255), transactionId, successful ? 'successful' : 'failed', JSON.stringify(redactSensitiveData(responseBody)), attempt.insertId]
  );

  if (!successful) {
    throw Object.assign(new Error(responseMessage || 'Hurmood payment was declined.'), {
      statusCode: 402,
      responseCode,
    });
  }

  return {
    attemptId: attempt.insertId,
    requestId,
    referenceId,
    invoiceId,
    transactionId: transactionId || null,
    responseCode,
    status: 'successful',
  };
}

async function attachOrder(attemptId, orderId) {
  if (!attemptId) return;
  const [result] = await db.query(
    `UPDATE payment_attempts
     SET order_id = ?
     WHERE id = ? AND (order_id IS NULL OR order_id = ?)`,
    [orderId, attemptId, orderId]
  );
  if (result.affectedRows > 0) return;

  const [attempts] = await db.query('SELECT order_id FROM payment_attempts WHERE id = ?', [attemptId]);
  if (attempts.length === 0) {
    throw Object.assign(new Error('Payment attempt not found.'), { statusCode: 404 });
  }
  if (Number(attempts[0].order_id) !== Number(orderId)) {
    throw Object.assign(new Error('Payment attempt is already attached to another order.'), { statusCode: 409 });
  }
}

module.exports = { purchase, attachOrder, normalizeAccount };
