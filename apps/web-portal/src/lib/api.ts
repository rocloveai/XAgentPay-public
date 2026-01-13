const USER_AGENT_API = process.env.NEXT_PUBLIC_USER_AGENT_API || 'http://localhost:3001/api';
const MERCHANT_AGENT_API = process.env.NEXT_PUBLIC_MERCHANT_AGENT_API || 'http://localhost:3002/api';

export interface PaymentData {
    merchant: string;
    amount: string;
    cost: string;
    status: string;
    signature?: string;
    orderId?: string;
}

export interface ChatResponse {
    text: string;
    payment?: PaymentData;
}

export interface Order {
    id: string;
    symbol: string;
    amount: number;
    unitPrice: number;
    totalPriceUSD: number;
    status: string;
    createdAt: string;
    iso2022Data?: any;
    protocol_trace?: {
        ucp_payload: any;
        nexus_signature: string;
        merchant_did: string;
        timestamp: number;
    };
}

export const api = {
    chat: async (message: string): Promise<ChatResponse> => {
        const res = await fetch(`${USER_AGENT_API}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message }),
        });
        if (!res.ok) throw new Error('Failed to send message');
        return res.json();
    },

    getOrders: async (): Promise<Order[]> => {
        const res = await fetch(`${MERCHANT_AGENT_API}/orders`);
        if (!res.ok) throw new Error('Failed to fetch orders');
        return res.json();
    },

    confirmPayment: async (orderId: string): Promise<{ success: boolean; newStatus: string }> => {
        const res = await fetch(`${MERCHANT_AGENT_API}/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId }),
        });
        if (!res.ok) throw new Error('Failed to confirm payment');
        return res.json();
    },

    getOrderStatus: async (orderId: string): Promise<{ status: string }> => {
        const res = await fetch(`${MERCHANT_AGENT_API}/order-status/${orderId}`);
        if (!res.ok) throw new Error('Failed to fetch order status');
        return res.json();
    },
};
