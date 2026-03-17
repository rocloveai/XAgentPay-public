import { keccak256, toHex, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const USDC_DECIMALS = 6;
const QUOTE_TTL_MS = 30 * 60 * 1000;
const DEMO_DISCOUNT_AMOUNT = "0.10";
const CHAIN_ID = 20250407;
const VERIFYING_CONTRACT = "0x0000000000000000000000000000000000000000";

const XAGENT_DOMAIN = {
    name: "XAgentPay",
    version: "1",
    chainId: CHAIN_ID,
    verifyingContract: VERIFYING_CONTRACT,
};

const XAGENT_QUOTE_TYPES = {
    XAgentQuote: [
        { name: "merchant_did", type: "string" },
        { name: "merchant_order_ref", type: "string" },
        { name: "amount", type: "uint256" },
        { name: "currency", type: "string" },
        { name: "chain_id", type: "uint256" },
        { name: "expiry", type: "uint256" },
        { name: "context_hash", type: "bytes32" },
    ],
};

function toUint256(amount, decimals = USDC_DECIMALS) {
    const parts = amount.split(".");
    const integerPart = parts[0] || "0";
    const fractionalPart = (parts[1] || "").padEnd(decimals, "0").slice(0, decimals);
    return (integerPart + fractionalPart).replace(/^0+/, "") || "0";
}

async function signQuote(merchantDid, privateKey, orderRef, amount, summary, lineItems, payerWallet) {
    const originalUint256 = toUint256(amount);
    const discountedUint256 = toUint256(DEMO_DISCOUNT_AMOUNT);
    const lineItemsUint256 = lineItems.map(item => ({
        ...item,
        amount: toUint256(item.amount)
    }));

    const context = {
        summary,
        line_items: lineItemsUint256,
        original_amount: originalUint256,
        payer_wallet: payerWallet
    };

    const contextHash = keccak256(toHex(JSON.stringify(context)));
    const expiry = Math.floor((Date.now() + QUOTE_TTL_MS) / 1000);

    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
        account,
        transport: http("https://devnet3openapi.platon.network/rpc"),
    });

    const signature = await walletClient.signTypedData({
        domain: XAGENT_DOMAIN,
        types: XAGENT_QUOTE_TYPES,
        primaryType: "XAgentQuote",
        message: {
            merchant_did: merchantDid,
            merchant_order_ref: orderRef,
            amount: BigInt(discountedUint256),
            currency: "USDC",
            chain_id: BigInt(CHAIN_ID),
            expiry: BigInt(expiry),
            context_hash: contextHash,
        },
    });

    return {
        merchant_did: merchantDid,
        merchant_order_ref: orderRef,
        amount: discountedUint256,
        currency: "USDC",
        chain_id: CHAIN_ID,
        expiry,
        context,
        signature
    };
}

const payerWallet = "0x6c3103FFF34916Ef2df44CE952BcE610d7e23cB5";

// Flight Merchant
const FLIGHT_DID = "did:xagent:20250407:demo_flight";
const FLIGHT_KEY = "0x3be84b4fa995ef7d87918aea8b0b1ad0cb88d66161b569c3fb55c8125cc31ba7";

// Hotel Merchant
const HOTEL_DID = "did:xagent:20250407:demo_hotel";
const HOTEL_KEY = "0xf39368a8751c244304bc1c69c55c9bab82a811cf471b3f7fe17451efd563c997";

async function main() {
    const quotes = [];

    // Outbound
    quotes.push(await signQuote(
        FLIGHT_DID, FLIGHT_KEY, "FLT-SINNRT-FEB-001", "850.00",
        "Flight SIN -> NRT (SQ638) - 2026-02-27",
        [{ name: "Premium Economy", amount: "850.00" }],
        payerWallet
    ));

    // Return
    quotes.push(await signQuote(
        FLIGHT_DID, FLIGHT_KEY, "FLT-NRTSIN-FEB-001", "850.00",
        "Flight NRT -> SIN (SQ637) - 2026-02-28",
        [{ name: "Premium Economy", amount: "850.00" }],
        payerWallet
    ));

    // Hotel
    quotes.push(await signQuote(
        HOTEL_DID, HOTEL_KEY, "HTL-TYO-FEB-001", "1200.00",
        "Park Hyatt Tokyo (1 Night) - 2026-02-27/28",
        [{ name: "King Room", amount: "1200.00" }],
        payerWallet
    ));

    console.log(JSON.stringify(quotes, null, 2));
}

main();
