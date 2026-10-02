#!/usr/bin/env node

/**
 * WAAFI Payment Integration Testing Utility
 * 
 * Tests various payment scenarios:
 * - Valid balance account (successful payment)
 * - Cancelled payment (user rejects prompt)
 * - Wrong PIN
 * - Insufficient balance
 */

const db = require('./config/db');
const WaafiService = require('./services/waafiService');

const TEST_SCENARIOS = {
  validBalance: {
    description: 'Valid balance account - should succeed',
    payerAccount: '0615555555', // Replace with test account
    amount: 0.10,
  },
  insufficientBalance: {
    description: 'Insufficient balance - should fail',
    payerAccount: '0615555556', // Replace with test account
    amount: 999.99,
  },
  cancelledPayment: {
    description: 'User cancels payment - should show pending then cancelled',
    payerAccount: '0615555557', // Replace with test account
    amount: 0.05,
  },
};

async function testWaafiPayment(scenario, customerId = 1, vendorId = 1) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: ${scenario.description}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Phone: ${scenario.payerAccount}`);
  console.log(`Amount: $${scenario.amount} USD`);

  try {
    const idempotencyKey = `test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    
    console.log(`\n→ Sending payment request...`);
    const result = await WaafiService.purchase({
      customerId,
      vendorId,
      payerAccount: scenario.payerAccount,
      amount: scenario.amount,
      currency: 'USD',
      description: `TEST: ${scenario.description}`,
      idempotencyKey
    });

    console.log(`\n✓ Payment request initiated:`);
    console.log(`  • Status: ${result.status}`);
    console.log(`  • Attempt ID: ${result.attemptId}`);
    console.log(`  • Reference ID: ${result.referenceId}`);
    console.log(`  • Transaction ID: ${result.transactionId || 'pending'}`);
    console.log(`  • Message: ${result.message || 'No message'}`);

    if (result.status === 'pending') {
      console.log(`\n⏳ PENDING: Waiting for WAAFI callback...`);
      console.log(`   WAAFI should send a prompt to: ${scenario.payerAccount}`);
      console.log(`   Callback will update order status when user responds`);
    }

    // Check payment attempt in DB
    const [attempts] = await db.query(
      'SELECT * FROM payment_attempts WHERE id = ?',
      [result.attemptId]
    );
    
    if (attempts.length > 0) {
      const attempt = attempts[0];
      console.log(`\n📊 Payment Attempt Record:`);
      console.log(`  • DB ID: ${attempt.id}`);
      console.log(`  • Status: ${attempt.status}`);
      console.log(`  • Response Code: ${attempt.response_code || 'not set'}`);
      console.log(`  • Created: ${attempt.created_at}`);
    }

    return result;
  } catch (error) {
    console.error(`\n✗ Error:`, error.message);
    return null;
  }
}

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║          WAAFI Payment Integration Test Suite             ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    // Test 1: Valid balance
    console.log('\n[1/3] Testing valid balance account...');
    await testWaafiPayment(TEST_SCENARIOS.validBalance, 1, 1);

    await new Promise(r => setTimeout(r, 2000));

    // Test 2: Insufficient balance
    console.log('\n[2/3] Testing insufficient balance scenario...');
    await testWaafiPayment(TEST_SCENARIOS.insufficientBalance, 1, 1);

    await new Promise(r => setTimeout(r, 2000));

    // Test 3: Cancelled payment
    console.log('\n[3/3] Testing payment cancellation scenario...');
    await testWaafiPayment(TEST_SCENARIOS.cancelledPayment, 1, 1);

    console.log('\n\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                   Test Summary                             ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('\n✓ All payment requests processed');
    console.log('\nNEXT STEPS:');
    console.log('1. Monitor WAAFI callbacks at POST /api/customer/payment/waafi/callback');
    console.log('2. Check payment_attempts table for updated status');
    console.log('3. Verify orders table has payment_status updated');
    console.log('4. Confirm notifications sent to customer');

  } catch (error) {
    console.error('Test suite error:', error);
  } finally {
    process.exit(0);
  }
}

// Run if executed directly
if (require.main === module) {
  runTests();
}

module.exports = { testWaafiPayment };
