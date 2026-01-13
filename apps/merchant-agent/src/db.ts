import fs from 'fs';
import path from 'path';

const DB_FILE = '/tmp/nexus_orders.json';

// Ensure DB file exists
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([]));
}

export interface Order {
    id: string;
    symbol: string;
    amount: number;
    unitPrice: number;
    totalPriceUSD: number;
    status: 'PENDING_PAYMENT' | 'PAID';
    createdAt: string;
    iso2022Data?: any;
    protocol_trace: {
        ucp_payload: any; // The full payment_action object
        nexus_signature: string;
        merchant_did: string;
        timestamp: number;
    };
}

export const getOrdersDB = (): Order[] => {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
};

export const saveOrdersDB = (orders: Order[]) => {
    fs.writeFileSync(DB_FILE, JSON.stringify(orders, null, 2));
};

// Proxy array to simulate the previous in-memory API if needed, 
// but it's better to expose functions.
export const orders: any[] = getOrdersDB();
// Warning: This export is only a snapshot at startup if used directly.
// We must refactor index.ts to use getOrdersDB() and saveOrdersDB().
