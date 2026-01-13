import { buyETH, getOrders, confirmPayment } from './index.js';

async function verify() {
    console.log('--- Merchant Agent Verification (Multi-Merchant: ETH Shop) ---');

    const input = {
        amount: 0.1,
    };

    try {
        console.log('1. Checking Initial Orders...');
        const initialOrders: any = await getOrders();
        console.log('Orders:', initialOrders.length);

        console.log('\n2. Running buyETH...');
        const result: any = await buyETH(input);
        console.log('Buy Result:', result.status, result.orderId);
        console.log('Formatted Cost:', result.formattedTotal);

        console.log('\n3. Checking Orders (should verify increment)...');
        const updatedOrders: any = await getOrders();
        console.log('Orders:', updatedOrders.length);

        const latestOrder = updatedOrders.find((o: any) => o.id === result.orderId);
        if (!latestOrder) throw new Error("New order not found in DB");
        console.log('Latest Order Status:', latestOrder.status);
        console.log('Merchant Name:', latestOrder.merchant_name);

        console.log('\n4. Confirming Payment...');
        if (!result.orderId) throw new Error("No Order ID returned");

        const confirmResult = await confirmPayment({ orderId: result.orderId });
        console.log('Confirm Result:', confirmResult);

        console.log('\n5. Checking Order Status (should be PAID)...');
        const finalOrders: any = await getOrders();
        const finalOrder = finalOrders.find((o: any) => o.id === result.orderId);
        console.log('Final Order Status:', finalOrder.status);

        if (finalOrder.status === 'PAID') {
            console.log('\n✅ Merchant Agent Verification Successful!');
        } else {
            console.log('\n❌ Verification Failed: Status incorrect.');
        }

    } catch (error) {
        console.error('\n❌ Error:', error);
        process.exit(1);
    }
}

verify();
