import { genkit, z } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { buyAsset } from '@nexuspay/merchant-agent';

// Initialize Genkit
const ai = genkit({
    plugins: [googleAI()],
    model: 'googleai/gemini-2.5-flash-lite',
});

// Global variable to capture payment data during a single flow execution.
// Note: In a production multi-user environment, this would need to be stored in a session or context.
let capturedPayment: any = null;

// The capturing tool is now defined globally once.
const capturingBuyAssetTool = ai.defineTool(
    {
        name: 'buyAsset',
        description: 'Buys a cryptocurrency asset given a symbol and amount. Returns the payment action details. IMPORTANT: The "symbol" argument MUST be the CoinGecko API ID (e.g. "ethereum" not "ETH", "bitcoin" not "BTC").',
        inputSchema: z.object({
            symbol: z.string().describe('The CoinGecko ID of the asset (e.g., "bitcoin", "ethereum").'),
            amount: z.number().describe('The amount to buy. Any positive decimal number is valid.'),
        }),
        outputSchema: z.any(),
    },
    async (input) => {
        console.log(`[Tool] Executing buyAsset for ${input.amount} ${input.symbol}...`);
        const result: any = await (buyAsset as any)(input);
        capturedPayment = result;
        console.log(`[Tool] Payment captured for order: ${result.orderId}`);
        return result;
    }
);

// Output Schema for the User Agent Flow
const AssistantOutputSchema = z.object({
    text: z.string(),
    paymentDetails: z.any().optional(),
});

export const shoppingAssistant = ai.defineFlow(
    {
        name: 'shoppingAssistant',
        inputSchema: z.string(),
        outputSchema: AssistantOutputSchema,
    },
    async (userInput) => {
        console.log(`\n--- New Request: ${userInput} ---`);
        capturedPayment = null; // Reset for this request

        let text = "";
        let paymentData = null;

        try {
            console.log("Generating LLM response...");
            const response = await ai.generate({
                prompt: userInput,
                system: `You are a shopping assistant for NexusPay. 
                Your goal is to help users buy cryptocurrency.
                
                Symbol Mapping Rules:
                - BTC / btc -> bitcoin
                - ETH / eth -> ethereum
                - SOL / sol -> solana
                
                Important: 
                - Any positive amount is valid (e.g., 0.1, 0.001, 1). 
                - There is NO minimum amount like 1e-8.
                - If you trigger a purchase, you MUST include the keyword 'PAYMENT_DETECTED' in your response.`,
                tools: [capturingBuyAssetTool],
            });

            text = response.text || (capturedPayment ? `I've prepared a payment request for your order.` : "I couldn't process that request.");
            console.log(`LLM Response generated: "${text.substring(0, 50)}..."`);

            if (capturedPayment) {
                console.log("Processing captured payment data...");

                // If the new card standard is present, use it
                if (capturedPayment.card) {
                    const card = capturedPayment.card;
                    paymentData = {
                        merchant: card.merchantName,
                        amount: card.title,
                        cost: card.amountDisplay,
                        status: card.status === 'PENDING' ? 'Verified' : card.status,
                        signature: card.actionPayload.data.signature,
                        orderId: capturedPayment.orderId,
                        nexusCard: card // Include the full card for future frontend use
                    };
                    console.log("Payment data prepared from NexusCard.");
                }
                // Fallback to legacy extraction if needed (though merchant agent is updated)
                else if (capturedPayment.payment_actions && capturedPayment.payment_actions.length > 0) {
                    const actionData = capturedPayment.payment_actions[0].data;
                    paymentData = {
                        merchant: "Nexus OTC",
                        amount: `${capturedPayment.description}`,
                        cost: capturedPayment.formattedTotal || "Pending...",
                        status: "Verified",
                        signature: actionData.signature,
                        orderId: capturedPayment.orderId
                    };
                    console.log("Payment data prepared from legacy actions.");
                }
            }

        } catch (e: any) {
            console.error("Assistant Error:", e);
            text = "I'm sorry, I encountered an internal error. Please try again.";
        }

        // Use a more flexible check for the keyword
        const isPaymentTriggered = text.toUpperCase().includes("PAYMENT_DETECTED") || capturedPayment !== null;

        if (isPaymentTriggered && paymentData) {
            console.log("🚨 Returning Payment Card to Frontend");
            return {
                text: `${text}\n\n[NexusPay]: Payment Verified & Processed.`,
                paymentDetails: paymentData
            };
        }

        console.log("Returning text-only response.");
        return { text };
    }
);

