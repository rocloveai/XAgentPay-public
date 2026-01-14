import { genkit, z } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { nexusPayPlugin, defineBatchPaymentAction } from '@nexuspay/core';

// Initialize Genkit
const ai = genkit({
    plugins: [googleAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY })],
    model: 'googleai/gemini-2.0-flash',
});

// Register NexusPay Core flows
nexusPayPlugin(ai, { merchantName: 'Nexus User Agent' });
const orchestrateBatch = defineBatchPaymentAction(ai);

// Tools for interacting with Merchant Agent
const buyETHTool = ai.defineTool(
    {
        name: 'buyETH',
        description: 'Buys Ethereum (ETH) from the Nexus ETH Shop. Returns a Nexus Payment Card.',
        inputSchema: z.object({
            amount: z.number().describe('The amount of ETH to buy.'),
        }),
        outputSchema: z.any(),
    },
    async (input) => {
        console.log(`[Tool] Executing buyETH for ${input.amount}...`);
        const MERCHANT_AGENT_API = process.env.MERCHANT_AGENT_API || 'http://localhost:3002/api';
        const response = await fetch(`${MERCHANT_AGENT_API}/buy-eth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input)
        });
        if (!response.ok) throw new Error(`ETH Merchant error: ${response.statusText}`);
        return response.json();
    }
);

const buyBTCTool = ai.defineTool(
    {
        name: 'buyBTC',
        description: 'Buys Bitcoin (BTC) from the Nexus BTC Store. Returns a Nexus Payment Card.',
        inputSchema: z.object({
            amount: z.number().describe('The amount of BTC to buy.'),
        }),
        outputSchema: z.any(),
    },
    async (input) => {
        console.log(`[Tool] Executing buyBTC for ${input.amount}...`);
        const MERCHANT_AGENT_API = process.env.MERCHANT_AGENT_API || 'http://localhost:3002/api';
        const response = await fetch(`${MERCHANT_AGENT_API}/buy-btc`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input)
        });
        if (!response.ok) throw new Error(`BTC Merchant error: ${response.statusText}`);
        return response.json();
    }
);

// Output Schema for the User Agent Flow
const AssistantOutputSchema = z.object({
    text: z.string(),
    paymentDetails: z.any().optional(),
    batchCard: z.any().optional(),
});

export const shoppingAssistant = ai.defineFlow(
    {
        name: 'shoppingAssistant',
        inputSchema: z.string(),
        outputSchema: AssistantOutputSchema,
    },
    async (userInput) => {
        console.log(`\n--- NEW REQUEST: ${userInput} ---`);

        // 1. Intent Extraction
        const intentResponse = await ai.generate({
            prompt: userInput,
            system: `You are an intent extractor for NexusPay.
            Identify if the user wants to buy ETH or BTC.
            Return a JSON array of purchase intents.
            Example: [{"type": "ETH", "amount": 1}, {"type": "BTC", "amount": 0.5}]
            Only support types: "ETH", "BTC".`,
            output: {
                format: 'json',
                schema: z.array(z.object({
                    type: z.enum(['ETH', 'BTC']),
                    amount: z.number()
                }))
            }
        });

        const intents = intentResponse.output || [];
        const collectedPaymentActions: any[] = [];

        // 2. Manual Execution based on Intent
        console.log(`[Flow] Extracted ${intents.length} intents.`);

        for (const intent of intents) {
            try {
                console.log(`[Flow] Processing intent: ${intent.type} ${intent.amount}`);
                let result: any;

                if (intent.type === 'ETH') {
                    result = await buyETHTool({ amount: intent.amount });
                } else if (intent.type === 'BTC') {
                    result = await buyBTCTool({ amount: intent.amount });
                }

                if (result && result.card && result.card.kind === 'nexus_pay_card') {
                    collectedPaymentActions.push(result);
                    console.log(`[Flow] Captured payment card for ${result.orderId}. Total so far: ${collectedPaymentActions.length}`);
                } else {
                    console.log(`[Flow] Tool result missing card or wrong kind. Symbol: ${intent.type}`);
                }
            } catch (err: any) {
                console.error(`[Flow] Error processing intent ${intent.type}:`, err.message || err);
            }
        }

        console.log(`[Flow] Final collected actions count: ${collectedPaymentActions.length}`);

        // 3. Auto-Aggregation Logic
        let finalCard = null;
        let responseText = "I'm sorry, I couldn't process your purchase request. Please try again.";

        if (intents.length > 0) {
            responseText = `I've prepared a purchase for ${intents.map(i => `${i.amount} ${i.type}`).join(' and ')}.`;
        }

        if (collectedPaymentActions.length > 0) {
            console.log(`[Flow] Aggregating ${collectedPaymentActions.length} payment requests...`);

            try {
                // Call the Orchestrator (Batch Flow) directly
                const batchResult = await orchestrateBatch({
                    items: collectedPaymentActions.map(a => a.card.actionPayload),
                    merchantNames: collectedPaymentActions.map(a => a.card.merchantName)
                });

                finalCard = batchResult;
                responseText = `I've consolidated your orders from ${collectedPaymentActions.map(a => a.card.merchantName).join(' and ')}. You can pay for all of them in a single transaction.`;
                console.log("[Flow] Batch card generated successfully.");

                // NEW: Notify Merchant Agent about the batch for consistency tracking
                const MERCHANT_AGENT_API = process.env.MERCHANT_AGENT_API || 'http://localhost:3002/api';
                fetch(`${MERCHANT_AGENT_API}/register-batch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: `BATCH-${Date.now()}`,
                        integrity_signature: finalCard.data.integrity_signature,
                        order_ids: finalCard.data.reference_ids,
                        total_amount: finalCard.data.total_amount,
                        sub_orders: finalCard.data.sub_orders
                    })
                }).catch(err => console.error("[Flow] Failed to register batch with merchant:", err));

            } catch (err: any) {
                console.error("[Flow] Aggregation failed:", err);
                if (err.stack) console.error(err.stack);
                // Fallback to the first individual card if aggregation fails
                finalCard = collectedPaymentActions[0].card;
            }
        }

        return {
            text: responseText,
            paymentDetails: finalCard ? {
                status: 'Batch Prepared',
                itemCount: collectedPaymentActions.length,
                orderIds: collectedPaymentActions.map(a => a.orderId)
            } : undefined,
            batchCard: finalCard
        };
    }
);
