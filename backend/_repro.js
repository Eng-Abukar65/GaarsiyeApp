const db=require('./config/db'); const M=require('./models/customerModel');
(async()=>{
  const [[p]]=await db.query("SELECT id, vendor_id, selling_price, stock_quantity FROM products WHERE vendor_id=1 AND is_active=1 LIMIT 1");
  console.log('using product:', p);
  const [[addr]]=await db.query("SELECT id, address_line, latitude, longitude FROM addresses WHERE customer_id=1 LIMIT 1");
  console.log('address:', addr ? addr.id : 'none');
  try{
    const orderId = await M.createOrder({
      customer_id: 1,
      vendor_id: 1,
      total_amount: 0.02,
      delivery_address: addr?.address_line || 'Test address',
      delivery_latitude: addr?.latitude || 2.04,
      delivery_longitude: addr?.longitude || 45.34,
      payment_method: 'waafi',
      payment_status: 'paid',
      delivery_fee: 0,
      distance_km: 1,
      destinations: null,
      provider_payment: { transactionId: 'REPRO-TX', attemptId: null },
      items: [{ product_id: p.id, quantity: 1, price: 0.02, unit_price: 0.02 }],
    });
    console.log('\n>>> createOrder SUCCEEDED, orderId =', orderId);
    await db.query("DELETE FROM commissions WHERE order_id=?",[orderId]);
    await db.query("DELETE FROM payments WHERE order_id=?",[orderId]);
    await db.query("DELETE FROM order_items WHERE order_id=?",[orderId]);
    await db.query("DELETE FROM order_destinations WHERE order_id=?",[orderId]).catch(()=>{});
    await db.query("DELETE FROM orders WHERE id=?",[orderId]);
    console.log('repro order cleaned up');
  }catch(e){
    console.log('\n>>> createOrder THREW:');
    console.log('   message :', e.message);
    console.log('   code    :', e.code, '| errno:', e.errno);
    console.log('   sql     :', String(e.sql||'').slice(0,220));
  }
  process.exit(0);
})();
