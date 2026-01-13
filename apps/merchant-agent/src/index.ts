import { genkit, z } from 'genkit';
import { definePaymentAction, PaymentIntent } from '@nexuspay/core';
import { getOrdersDB, saveOrdersDB } from './db.js';

// Initialize Genkit
const ai = genkit({
    plugins: [],
});

// Register the Nexus Payment Flow using the helper
const createPaymentActionFlow = definePaymentAction(ai, {
    escrowContractAddress: '0x1234567890123456789012345678901234567890',
    chainId: 1,
});

/**
 * Generates ISO 20022 compliant JSON data for the order.
 * Follows a simplified pain.001 structure.
 */
function generateISO20022Data(orderId: string, symbol: string, amount: number, priceUSD: number, merchantName: string, signature?: string) {
    const now = new Date().toISOString();
    const totalUSD = (priceUSD * amount).toFixed(2);

    return {
        Document: {
            attr: { xmlns: "urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" },
            CstmrCdtTrfInitn: {
                GrpHdr: {
                    MsgId: orderId,
                    CreDtTm: now,
                    NbOfTxs: "1",
                    InitgPty: {
                        Nm: "Nexus User Agent"
                    }
                },
                PmtInf: {
                    PmtInfId: `${orderId}-PMT`,
                    PmtMtd: "TRF",
                    ReqdExctnDt: now.split('T')[0],
                    Dbtr: {
                        Nm: "Customer"
                    },
                    Cdtr: {
                        Nm: merchantName
                    },
                    CdtTrfTxInf: {
                        PmtId: {
                            EndToEndId: orderId
                        },
                        Amt: {
                            InstdAmt: {
                                attr: { Ccy: "USDC" },
                                value: totalUSD
                            }
                        },
                        SplmtryData: {
                            Envlp: {
                                CryptoSplmtryData: {
                                    Asset: symbol,
                                    Amount: amount.toString(),
                                    UnitPrice: priceUSD.toString(),
                                    Chain: "Ethereum Mainnet",
                                    Signature: signature || "Pending"
                                }
                            }
                        }
                    }
                }
            }
        }
    };
}


// Output Schema for the OTC Flow
const BuyAssetOutputSchema = z.object({
    status: z.string(),
    description: z.string(),
    formattedTotal: z.string(),
    orderId: z.string().optional(),
    card: z.any().optional(),
    payment_actions: z.array(z.any()),
});

async function processCryptoPurchase(input: { symbol: string, amount: number, merchantName: string, merchantDid: string }) {
    console.log(`Fetching price for ${input.symbol} for ${input.merchantName}...`);

    // 1. Fetch real-time price from CoinGecko
    const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${input.symbol}&vs_currencies=usd`
    );

    if (!response.ok) {
        throw new Error(`Failed to fetch price: ${response.statusText}`);
    }

    const data: any = await response.json();
    if (!data[input.symbol] || !data[input.symbol].usd) {
        throw new Error(`Symbol ${input.symbol} not found or no USD price.`);
    }

    const price = data[input.symbol].usd;
    console.log(`Price of ${input.symbol}: $${price}`);

    // 2. Calculate Total
    const totalUSD = price * input.amount;
    const usdcAmount = Math.round(totalUSD * 1000000).toString();

    const orderId = `OTC-${input.symbol.toUpperCase()}-${Date.now()}`;

    // 3. Call Nexus Payment Flow
    const paymentIntent: PaymentIntent = {
        amount: usdcAmount,
        currency: 'USDC',
        merchantDid: input.merchantDid,
        merchantName: input.merchantName,
        orderId: orderId,
        expiry: Math.floor(Date.now() / 1000) + 3600,
    };

    // Call the flow directly
    const paymentResult = await createPaymentActionFlow(paymentIntent);

    // 4. Persist Order
    const newOrder = {
        id: orderId,
        symbol: input.symbol,
        amount: input.amount,
        unitPrice: price,
        totalPriceUSD: totalUSD,
        status: 'PENDING_PAYMENT' as const,
        merchant_name: input.merchantName,
        createdAt: new Date().toISOString(),
        iso2022Data: generateISO20022Data(orderId, input.symbol, input.amount, price, input.merchantName, paymentResult.actionPayload.data.signature),
        protocol_trace: {
            ucp_payload: paymentResult.actionPayload,
            nexus_signature: paymentResult.actionPayload.data.signature,
            merchant_did: paymentResult.actionPayload.data.merchant_did,
            timestamp: Date.now(),
        }
    };

    const currentOrders = getOrdersDB();
    currentOrders.push(newOrder);
    saveOrdersDB(currentOrders);

    console.log(`[DB] Order saved with merchant_name: ${newOrder.merchant_name}`);
    console.log(`[DB] Current order count: ${currentOrders.length}`);

    console.log(`Order created: ${orderId} by ${input.merchantName}`);

    // 5. Return Result
    return {
        status: 'PENDING_PAYMENT',
        description: `Buying ${input.amount} ${input.symbol.toUpperCase()} at $${price}/unit from ${input.merchantName}`,
        formattedTotal: `$${totalUSD.toFixed(2)}`,
        orderId: orderId,
        card: paymentResult,
        payment_actions: [paymentResult.actionPayload],
    };
}

export const buyETH = ai.defineFlow(
    {
        name: 'merchant_eth/buy',
        inputSchema: z.object({
            amount: z.number(),
        }),
        outputSchema: BuyAssetOutputSchema,
    },
    async (input) => {
        return processCryptoPurchase({
            symbol: 'ethereum',
            amount: input.amount,
            merchantName: 'Nexus ETH Shop',
            merchantDid: 'did:platon:merchant_eth_001'
        });
    }
);

export const buyBTC = ai.defineFlow(
    {
        name: 'merchant_btc/buy',
        inputSchema: z.object({
            amount: z.number(),
        }),
        outputSchema: BuyAssetOutputSchema,
    },
    async (input) => {
        return processCryptoPurchase({
            symbol: 'bitcoin',
            amount: input.amount,
            merchantName: 'Nexus BTC Store',
            merchantDid: 'did:platon:merchant_btc_002'
        });
    }
);

export const getOrders = ai.defineFlow(
    {
        name: 'merchant/getOrders',
        inputSchema: z.void().optional(),
        outputSchema: z.array(z.any()),
    },
    async () => {
        const orders = getOrdersDB();
        console.log(`[API] getOrders called, returning ${orders.length} orders. Sample merchant_name: ${orders[0]?.merchant_name}`);
        return orders;
    }
);

export const confirmPayment = ai.defineFlow(
    {
        name: 'merchant/confirmPayment',
        inputSchema: z.object({ orderId: z.string() }),
        outputSchema: z.object({ success: z.boolean(), newStatus: z.string() }),
    },
    async ({ orderId }) => {
        const orders = getOrdersDB();
        const order = orders.find(o => o.id === orderId);
        if (!order) {
            throw new Error(`Order ${orderId} not found`);
        }
        order.status = 'PAID';
        saveOrdersDB(orders);
        return { success: true, newStatus: 'PAID' };
    }
);

export const getOrderStatus = ai.defineFlow(
    {
        name: 'merchant/getOrderStatus',
        inputSchema: z.object({ orderId: z.string() }),
        outputSchema: z.object({ status: z.string() }).optional(),
    },
    async ({ orderId }) => {
        const orders = getOrdersDB();
        const order = orders.find(o => o.id === orderId);
        return order ? { status: order.status } : undefined;
    }
);
