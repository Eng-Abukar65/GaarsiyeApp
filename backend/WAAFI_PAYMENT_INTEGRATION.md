# WAAFI Async Payment Integration

## Overview

This implementation fixes the WAAFI payment integration to properly handle asynchronous payment flows. Instead of blocking and failing when payment doesn't complete immediately, the system now:

1. **Sends payment request** to WAAFI
2. **Keeps order in PENDING state** while waiting for customer response
3. **Receives callback** from WAAFI when user approves/denies
4. **Updates order status** based on callback result
5. **Notifies customer** of payment outcome

## Key Changes

### 1. Phone Number Formatting ✓
- **Old**: `061xxxxxxx` → handled incorrectly
- **New**: `061xxxxxxx` → `25261xxxxxxx` (proper Somali format)
- Location: `backend/services/waafiService.js` `normalizeAccount()`

### 2. Payment Status Flow ✓
- **Immediate response NOT required** from WAAFI
- Payment request returns `status: 'pending'` when sent
- Order created with `payment_status: 'pending'` for WAAFI payments
- Callback handler updates `payment_status` to `'paid'` or `'failed'`

Statuses:
```
pending    - Waiting for customer to approve EVC prompt
paid       - Payment confirmed by WAAFI
failed     - Payment declined
cancelled  - User cancelled the transaction
```

### 3. Async Flow Implementation ✓

**Before (Broken):**
```
POST /api/customer/orders
└─ WaafiService.purchase()
   ├─ Send to WAAFI
   ├─ Wait 30s for response
   ├─ If timeout/not 2001 → Throw error ❌
   └─ Order NOT created
```

**After (Fixed):**
```
POST /api/customer/orders
├─ WaafiService.purchase()
│  ├─ Send to WAAFI
│  ├─ Store as payment_attempts (status: pending)
│  └─ Return immediately ✓
├─ Create order (payment_status: pending)
├─ Notify customer "Approve EVC prompt"
└─ Return orderId ✓

[Meanwhile, WAAFI contacts customer via SMS/app]

Later: POST /api/customer/payment/waafi/callback
├─ Receive WAAFI callback
├─ Update payment_attempts (status: paid/failed/cancelled)
├─ Update order (payment_status: paid/failed)
├─ Send notification to customer
└─ Return 200 OK ✓
```

### 4. Callback Endpoint ✓

**Route:** `POST /api/customer/payment/waafi/callback`

**No authentication required** (WAAFI calls this directly)

**Request body:**
```json
{
  "responseCode": "2001",
  "transactionId": "WAAFI-TXN-12345",
  "referenceId": "LPG-1-1719665123456",
  "invoiceId": "INV-1-1719665123456",
  "responseMsg": "Transaction successful"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment callback processed"
}
```

### 5. Phone Number Examples

Somali phone numbers are normalized as follows:

```
Input               → Output
061xxxxxxx         → 25261xxxxxxx
0615555555         → 25261555555
5261xxxxxxx        → 25261xxxxxxx
25261xxxxxxx       → 25261xxxxxxx (no change)
```

## Database Schema

### payment_attempts table
```sql
CREATE TABLE payment_attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  vendor_id INT,
  order_id INT,
  provider VARCHAR(50) DEFAULT 'waafi',
  idempotency_key VARCHAR(120),
  reference_id VARCHAR(100),
  invoice_id VARCHAR(100),
  payer_account VARCHAR(50),
  amount DECIMAL(10, 2),
  currency VARCHAR(10) DEFAULT 'USD',
  status VARCHAR(30) DEFAULT 'pending',  -- pending, successful, failed, cancelled
  response_code VARCHAR(10),
  response_message TEXT,
  provider_transaction_id VARCHAR(100),
  raw_response LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### orders table (new column)
```sql
ALTER TABLE orders ADD COLUMN payment_status VARCHAR(20) DEFAULT 'pending';
```

## API Response Changes

### POST /api/customer/orders (Checkout)

**Before (Broken):**
```json
{
  "message": "Order placed successfully",
  "orderId": 123,
  "total_amount": 10.50,
  "payment_transaction_id": "..." // or error if WAAFI failed
}
```

**After (Fixed - WAAFI Pending):**
```json
{
  "message": "Order placed successfully",
  "orderId": 123,
  "total_amount": 10.50,
  "payment_status": "pending",
  "payment_message": "Please approve the EVC/WAAFI prompt on your phone.",
  "payment_attempt_id": 456,
  "payment_transaction_id": null  // not available yet
}
```

**After (Fixed - Immediate Success):**
```json
{
  "message": "Order placed successfully",
  "orderId": 123,
  "total_amount": 10.50,
  "payment_status": "paid",
  "payment_transaction_id": "WAAFI-TXN-789",
  "payment_attempt_id": 456
}
```

**After (Fixed - Cash on Delivery):**
```json
{
  "message": "Order placed successfully",
  "orderId": 123,
  "total_amount": 10.50,
  "payment_status": "pending",
  "payment_message": null  // No pending message for COD
}
```

## Testing

### 1. Run Migration
```bash
cd backend
node migrate_waafi_payment_flow.js
```

### 2. Run Test Suite
```bash
node test_waafi_payment.js
```

This will test:
- ✓ Valid balance account (should succeed)
- ✓ Insufficient balance (should fail)
- ✓ User cancellation (should show pending)
- ✓ Wrong PIN (should fail)

### 3. Manual Testing Flow

**Step 1: Create Order with WAAFI Payment**
```bash
POST http://localhost:5001/api/customer/orders
{
  "payment_method": "waafi",
  "payment_phone": "0615555555",
  "items": [{"product_id": 1, "quantity": 1}],
  "delivery_address": "Mogadishu"
}
```

**Expected Response:**
- Status: 201
- payment_status: "pending"
- Order created successfully ✓

**Step 2: Customer Receives Prompt**
- WAAFI sends EVC/WAAFI prompt to `+252615555555`
- User enters PIN to approve or cancels

**Step 3: WAAFI Sends Callback**
WAAFI calls your backend:
```bash
POST http://your-server/api/customer/payment/waafi/callback
{
  "responseCode": "2001",
  "transactionId": "WAAFI-TXN-ABC123",
  "referenceId": "LPG-1-1719665123456"
}
```

**Step 4: Order Status Updated**
- Order payment_status changed to "paid"
- Customer receives notification
- Order ready for vendor assignment

### 4. Logging

All payment operations are logged with detailed information:

```
[WAAFI] Initiating payment: attemptId=1, referenceId=LPG-1-123456, account=2526...5555, amount=10.50 USD
[WAAFI] Response: code=2001, transactionId=WAAFI-123, successful=true
[WAAFI CALLBACK] Received: code=2001, transactionId=WAAFI-123, referenceId=LPG-1-123456
[WAAFI CALLBACK] Updated order 123: payment_status=paid
```

## Timeout Handling

If WAAFI doesn't respond within 30 seconds:
- Payment attempt stored as `status: pending`
- Order created with `payment_status: pending`
- Customer shown message: "Please approve the EVC/WAAFI prompt on your phone"
- Callback will update status when WAAFI responds (can take several minutes)

Timeout is configurable:
```bash
WAAFI_TIMEOUT_MS=30000  # milliseconds
```

## Error Handling

### Client sees "Please approve EVC/WAAFI prompt" when:
- ✓ Request sent to WAAFI successfully
- ✓ Waiting for customer response (pending)
- ✓ Waiting for WAAFI callback (pending)

### Client sees "Payment Failed" when:
- ✓ WAAFI returns negative response (code ≠ 2001)
- ✓ Customer entered wrong PIN
- ✓ Insufficient balance
- ✓ Account doesn't exist
- ✓ Callback reports failed status

### Client sees "Payment Cancelled" when:
- ✓ Customer explicitly cancels EVC/WAAFI prompt
- ✓ Callback reports code 5310 (user rejected)

## Production Checklist

- [ ] Run migration: `node migrate_waafi_payment_flow.js`
- [ ] Update WAAFI merchant settings with callback URL: `https://yourdomain.com/api/customer/payment/waafi/callback`
- [ ] Test with valid account (user has balance)
- [ ] Test with insufficient balance account
- [ ] Test with account that cancels payment
- [ ] Monitor logs for payment attempts
- [ ] Verify email/SMS notifications work
- [ ] Set up monitoring for callback failures
- [ ] Document callback URL with WAAFI support team

## Integration with Flutter App

The Flutter app should:

1. **Show loading** after order creation
2. **Check payment_status** in response:
   - `pending` + `payment_message` → Show "Waiting for payment confirmation" with timer
   - `paid` → Show "Payment successful"
   - `failed` → Show "Payment failed, try again"
3. **Listen for notifications** for payment updates
4. **Implement retry logic** for failed payments
5. **Don't show "Payment Failed" immediately** for WAAFI (it's async)

## Support & Troubleshooting

### Payment shows as failed but customer approved it?
- Check WAAFI callback logs
- Verify callback endpoint is accessible
- Check firewall/network settings
- Review raw_response in payment_attempts table

### Customer never receives EVC/WAAFI prompt?
- Verify phone number format (should be 25261xxxxxxx)
- Check if WAAFI account has enough balance for test
- Contact WAAFI support team
- Review WAAFI request logs

### Callback not received?
- Verify callback URL is correct in WAAFI settings
- Check that endpoint is publicly accessible
- Review HTTP status codes in WAAFI dashboard
- Add logging to callback handler

### Test payment still pending after 5 minutes?
- WAAFI may have network issues
- Customer may not have received prompt (check SMS)
- Verify phone number is valid
- Contact WAAFI technical support
