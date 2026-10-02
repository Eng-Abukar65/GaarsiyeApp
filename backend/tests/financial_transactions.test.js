const test = require('node:test');
const assert = require('node:assert/strict');
const FinancialTransactionService = require('../services/financialTransactionService');

test('FinancialTransactionService - toNum rounds monetary amounts to 2 decimals', () => {
  assert.strictEqual(FinancialTransactionService.toNum(12.3456), 12.35);
  assert.strictEqual(FinancialTransactionService.toNum('45.678'), 45.68);
  assert.strictEqual(FinancialTransactionService.toNum(null), 0.00);
});

test('FinancialTransactionService - maskPhone privacy check', () => {
  assert.strictEqual(FinancialTransactionService.maskPhone('252613344556'), '25261XXXXX56');
  assert.strictEqual(FinancialTransactionService.maskPhone('123'), '123');
});

test('FinancialTransactionService - calculateSummary computes metrics correctly', () => {
  const dummyDataset = [
    {
      id: 'TXN-ORD-1',
      totalAmount: 100.00,
      refundedAmount: 0.00,
      status: 'Paid',
      type: 'Fuel Order Payment',
      createdAt: new Date().toISOString()
    },
    {
      id: 'TXN-ORD-2',
      totalAmount: 50.00,
      refundedAmount: 0.00,
      status: 'Pending',
      type: 'Spare Parts Payment',
      createdAt: new Date().toISOString()
    },
    {
      id: 'TXN-SUB-1',
      totalAmount: 200.00,
      refundedAmount: 0.00,
      status: 'Paid',
      type: 'Vendor Subscription Payment',
      createdAt: new Date().toISOString()
    },
    {
      id: 'TXN-SET-1',
      totalAmount: 500.00,
      refundedAmount: 0.00,
      status: 'Paid',
      type: 'Vendor Settlement',
      createdAt: new Date().toISOString()
    }
  ];

  const summary = FinancialTransactionService.calculateSummary(dummyDataset);

  assert.strictEqual(summary.totalTransactionValue, 800.00);
  assert.strictEqual(summary.totalSuccessfulPayments, 3);
  assert.strictEqual(summary.totalPendingPayments, 1);
  assert.strictEqual(summary.totalCustomerPayments, 100.00);
  assert.strictEqual(summary.totalVendorSubscriptionPayments, 200.00);
  assert.strictEqual(summary.totalVendorSettlements, 500.00);
});

test('FinancialTransactionService - getFilteredTransactions returns paginated list and summary', async () => {
  const result = await FinancialTransactionService.getFilteredTransactions({ page: 1, limit: 10 });
  
  assert.strictEqual(result.success, true);
  assert.ok(result.summary);
  assert.ok(Array.isArray(result.transactions));
  assert.ok(result.pagination);
  assert.strictEqual(typeof result.pagination.total, 'number');
});

test('FinancialTransactionService - getVendorFinancialHistory returns expected structure', async () => {
  const history = await FinancialTransactionService.getVendorFinancialHistory(1);
  
  assert.strictEqual(history.vendorId, 1);
  assert.ok(history.summary);
  assert.strictEqual(typeof history.summary.totalCustomerRevenue, 'number');
  assert.strictEqual(typeof history.summary.outstandingSettlementBalance, 'number');
  assert.ok(Array.isArray(history.transactions));
});
