import { shoppingAssistant } from './index.js';

async function verify() {
    console.log('--- User Agent Verification ---');

    const input = "I want to buy 0.1 ethereum";

    try {
        console.log(`User: ${input}`);
        console.log('Running shoppingAssistant...');

        const result = await shoppingAssistant(input);

        console.log('\n--- Result ---');
        console.log(result.text);
        if (result.paymentDetails) {
            console.log("Payment Details:", result.paymentDetails);
        }

        if (result.text.includes("PAYMENT_DETECTED") || result.paymentDetails) {
            console.log('\n✅ User Agent Verification Successful!');
        } else {
            console.log('\n⚠️ Verification completed but no payment detected.');
        }

    } catch (error) {
        console.error('\n❌ Error:', error);
        process.exit(1);
    }
}

verify();
