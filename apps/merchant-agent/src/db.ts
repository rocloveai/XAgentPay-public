import fs from 'fs';
import path from 'path';

const DB_FILE = '/tmp/nexus_orders.json';
const BATCH_DB_FILE = '/tmp/nexus_batches.json';

// Ensure DB files exist
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([]));
if (!fs.existsSync(BATCH_DB_FILE)) fs.writeFileSync(BATCH_DB_FILE, JSON.stringify([]));

export interface Order {
    id: string;
    symbol: string;
    amount: number;
    unitPrice: number;
    totalPriceUSD: number;
    status: 'PENDING_PAYMENT' | 'PAID';
    merchant_name: string;
    createdAt: string;
    parent_batch_id?: string; // LINK TO BATCH
    iso2022Data?: any;
    protocol_trace: {
        ucp_payload: any;
        nexus_signature: string;
        merchant_did: string;
        timestamp: number;
    };
}

export interface Batch {
    id: string;
    integrity_signature: string;
    order_ids: string[];
    total_amount: string;
    sub_orders: any[]; // NEW: Semantic breakdown
    createdAt: string;
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

export const getBatchesDB = (): Batch[] => {
    try {
        const data = fs.readFileSync(BATCH_DB_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
};

export const saveBatchesDB = (batches: Batch[]) => {
    fs.writeFileSync(BATCH_DB_FILE, JSON.stringify(batches, null, 2));
};
