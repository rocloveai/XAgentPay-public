import { z } from 'genkit';
import { NexusPaymentActionSchema, NexusBatchActionSchema } from './index.js';

/**
 * Aggregates multiple single payment actions into a single batch action.
 */
export function aggregate(
    items: z.infer<typeof NexusPaymentActionSchema>[],
    merchantNames?: string[]
): z.infer<typeof NexusBatchActionSchema> {
    if (items.length === 0) {
        throw new Error("Cannot aggregate an empty list of items");
    }

    const first = items[0].data;
    const chainId = first.chain_id;
    const currencyContract = first.contract_address;

    let totalAmount = BigInt(0);
    const recipients: string[] = [];
    const amounts: string[] = [];
    const referenceIds: string[] = [];
    const sub_orders: any[] = [];

    items.forEach((item, i) => {
        const d = item.data;

        if (d.chain_id !== chainId) throw new Error(`Chain ID mismatch`);
        if (d.contract_address !== currencyContract) throw new Error(`Currency mismatch`);

        totalAmount += BigInt(d.amount);
        recipients.push(d.merchant_did);
        amounts.push(d.amount);
        referenceIds.push(d.reference_id);

        sub_orders.push({
            merchant_did: d.merchant_did,
            order_id: d.reference_id,
            amount: d.amount,
            merchant_name: merchantNames?.[i] || "Nexus Merchant",
            token_amount: d.token_amount,
            token_symbol: d.token_symbol
        });
    });

    const signaturePayload = JSON.stringify({
        chainId,
        currencyContract,
        totalAmount: totalAmount.toString(),
        recipients,
        amounts,
        referenceIds,
        sub_orders
    });
    const integritySignature = `batch_0x` + Buffer.from(signaturePayload).toString('hex').substring(0, 64);

    return {
        type: 'urn:ucp:payment:nexus_batch_v1',
        description: `Consolidated Payment (${items.length} items)`,
        data: {
            chain_id: chainId,
            contract_address: "0xBATCH_CONTRACT_ADDRESS_PLACEHOLDER",
            currency_contract: currencyContract,
            total_amount: totalAmount.toString(),
            recipients,
            amounts,
            reference_ids: referenceIds,
            sub_orders,
            integrity_signature: integritySignature
        }
    };
}
