import { z } from 'genkit';

// Data Schemas
export const PaymentIntentSchema = z.object({
    amount: z.string(),
    currency: z.string(),
    merchantDid: z.string(),
    merchantName: z.string().optional(),
    orderId: z.string(),
    expiry: z.number().optional(),
    tokenAmount: z.number().optional(),
    tokenSymbol: z.string().optional(),
});

export const NexusPaymentActionSchema = z.object({
    type: z.literal('urn:ucp:payment:nexus_v1'),
    data: z.object({
        merchant_did: z.string(),
        chain_id: z.number(),
        contract_address: z.string(),
        amount: z.string(),
        reference_id: z.string(),
        signature: z.string(),
        token_amount: z.number().optional(),
        token_symbol: z.string().optional(),
    }).passthrough(),
});

export const NexusCardSchema = z.object({
    kind: z.literal('nexus_pay_card'), // The discriminator
    title: z.string(),                 // e.g., "Flight to Singapore"
    merchantName: z.string(),          // e.g., "Trip.com"
    amountDisplay: z.string(),         // e.g., "530.00 USDC"
    status: z.enum(['PENDING', 'PAID', 'EXPIRED']),
    // The underlying protocol data (hidden from UI, used for logic)
    actionPayload: NexusPaymentActionSchema,
});

export const BatchInputSchema = z.object({
    items: z.array(NexusPaymentActionSchema),
    merchantNames: z.array(z.string()).optional(), // Helper for semantic metadata
    payerAddress: z.string().optional()
});

export const NexusBatchActionSchema = z.object({
    type: z.literal('urn:ucp:payment:nexus_batch_v1'),
    description: z.string(),
    data: z.object({
        chain_id: z.number(),
        contract_address: z.string(),
        currency_contract: z.string(),
        total_amount: z.string(),
        recipients: z.array(z.string()),
        amounts: z.array(z.string()),
        reference_ids: z.array(z.string()),
        // SEMANTIC SUB-ORDERS FOR AUTO-SPLITTING
        sub_orders: z.array(z.object({
            merchant_did: z.string(),
            order_id: z.string(),
            amount: z.string(),
            merchant_name: z.string().optional(),
            token_amount: z.number().optional(),
            token_symbol: z.string().optional(),
        })),
        integrity_signature: z.string(),
    })
});

export { aggregate } from './aggregator.js';

export const NexusAgentManifestSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    version: z.string(),
    capabilities: z.array(z.string()),
    endpoints: z.object({
        chat: z.string().optional(),
        payment: z.string().optional(),
        discovery: z.string(),
    }),
    flows: z.array(z.object({
        name: z.string(),
        description: z.string(),
        inputSchema: z.any().optional(),
    })),
});

export type PaymentIntent = z.infer<typeof PaymentIntentSchema>;
export type NexusPaymentAction = z.infer<typeof NexusPaymentActionSchema>;
export type NexusCard = z.infer<typeof NexusCardSchema>;
export type NexusAgentManifest = z.infer<typeof NexusAgentManifestSchema>;

export interface NexusPayOptions {
    escrowContractAddress?: string;
    chainId?: number;
    merchantName?: string;
}

// Helper to mock signing
function mockSign(intent: PaymentIntent, options: NexusPayOptions): string {
    const payload = JSON.stringify({ ...intent, ...options });
    // In a real app, this would be a cryptographic signature
    return `0x` + Buffer.from(payload).toString('hex').substring(0, 64);
}

// Direct Helper to Define Flow
export function definePaymentAction(ai: any, options: NexusPayOptions) {
    return ai.defineFlow(
        {
            name: 'createPaymentAction',
            inputSchema: PaymentIntentSchema,
            outputSchema: NexusCardSchema,
        },
        async (input: PaymentIntent) => {
            console.log('Processing PaymentIntent:', input);

            const chainId = options.chainId || 1;
            const contractAddress = options.escrowContractAddress || '0x0000000000000000000000000000000000000000';
            const signature = mockSign(input, { chainId, escrowContractAddress: contractAddress });

            console.log('Mock signing data:', { ...input, escrowContractAddress: contractAddress, chainId });

            const actionPayload = {
                type: 'urn:ucp:payment:nexus_v1' as const,
                data: {
                    merchant_did: input.merchantDid,
                    chain_id: chainId,
                    contract_address: contractAddress,
                    amount: input.amount,
                    reference_id: input.orderId,
                    signature: signature,
                    token_amount: input.tokenAmount,
                    token_symbol: input.tokenSymbol,
                },
            };

            return {
                kind: 'nexus_pay_card' as const,
                title: `Order ${input.orderId}`,
                merchantName: input.merchantName || options.merchantName || "Nexus Merchant",
                amountDisplay: `${(parseInt(input.amount) / 1000000).toFixed(2)} ${input.currency}`,
                status: 'PENDING' as const,
                actionPayload: actionPayload,
            };
        }
    );
}

/**
 * Helper to define the Batch Orchestration flow.
 */
export function defineBatchPaymentAction(ai: any) {
    return ai.defineFlow(
        {
            name: 'nexus/orchestrateBatch',
            inputSchema: BatchInputSchema,
            outputSchema: NexusBatchActionSchema,
        },
        async (input: any) => {
            const { aggregate } = await import('./aggregator.js');
            return aggregate(input.items, input.merchantNames);
        }
    );
}

/**
 * Main Plugin to register all NexusPay related flows.
 */
export function nexusPayPlugin(ai: any, options: NexusPayOptions) {
    // 1. Single Payment Action (existing)
    definePaymentAction(ai, options);

    // 2. Batch Orchestration
    defineBatchPaymentAction(ai);
}
