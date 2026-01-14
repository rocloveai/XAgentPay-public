'use client';

import React, { useState, useEffect } from 'react';
import { api, Order } from '@/lib/api';

interface BatchCardProps {
    batch: {
        description: string;
        data: {
            total_amount: string;
            recipients: string[];
            amounts: string[];
            reference_ids: string[];
            currency_contract: string;
            integrity_signature: string;
            sub_orders?: {
                merchant_did: string;
                order_id: string;
                amount: string;
                merchant_name?: string;
                token_amount?: number;
                token_symbol?: string;
            }[];
        };
    };
}

export function BatchCard({ batch }: BatchCardProps) {
    const [status, setStatus] = useState<'idle' | 'paid'>('idle');
    const [subOrders, setSubOrders] = useState<Order[]>([]);
    const [isFullyDelivered, setIsFullyDelivered] = useState(false);

    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (status === 'paid' && !isFullyDelivered) {
            interval = setInterval(async () => {
                try {
                    const allOrders = await api.getOrders();
                    const filtered = allOrders.filter(o => batch.data.reference_ids.includes(o.id));
                    setSubOrders(filtered);

                    const allPaid = filtered.length === batch.data.reference_ids.length &&
                        filtered.every(o => o.status === 'PAID');

                    if (allPaid) {
                        setIsFullyDelivered(true);
                        clearInterval(interval);
                    }
                } catch (error) {
                    console.error("Polling sub-orders error:", error);
                }
            }, 3000);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [status, isFullyDelivered, batch.data.reference_ids]);

    if (!batch || !batch.data) return null;

    const totalDisplay = (parseInt(batch.data.total_amount) / 1000000).toFixed(2);

    return (
        <div className="w-full bg-gradient-to-br from-indigo-950 to-gray-950 rounded-xl p-5 mt-3 border border-indigo-500/30 shadow-[0_0_25px_rgba(99,102,241,0.2)] relative overflow-hidden">
            <div className="flex justify-between items-start mb-4 border-b border-indigo-500/20 pb-3">
                <div>
                    <div className="text-[10px] text-indigo-400 uppercase tracking-widest font-bold mb-1">Nexus Batch Orchestrator</div>
                    <div className="text-2xl font-bold text-white tracking-tight">{totalDisplay} USDC</div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${status === 'paid' ? 'bg-green-900/30 text-green-400 border-green-800' : 'bg-indigo-900/30 text-indigo-400 border-indigo-800'}`}>
                    {status === 'paid' ? (isFullyDelivered ? 'DELIVERY CONFIRMED' : 'BATCH PAID') : 'AGGREGATED PAYMENT'}
                </span>
            </div>

            {/* Delivery Info Section */}
            {status === 'paid' && subOrders.length > 0 && (
                <div className="mb-4 bg-green-900/10 border border-green-500/20 rounded-lg p-3">
                    <div className="text-[10px] text-green-400 uppercase tracking-widest font-bold mb-2">Assets Received / Delivered</div>
                    <div className="space-y-2">
                        {subOrders.map((order) => (
                            <div key={order.id} className="flex justify-between items-center text-xs">
                                <div className="flex flex-col">
                                    <span className="text-white font-medium">{order.amount} {order.symbol}</span>
                                    <span className="text-[9px] text-gray-500 font-mono">{order.merchant_name}</span>
                                </div>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] ${order.status === 'PAID' ? 'text-green-400 bg-green-400/10' : 'text-yellow-400 bg-yellow-400/10'}`}>
                                    {order.status === 'PAID' ? 'Delivered' : 'Pending...'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {!isFullyDelivered && (
                <>
                    <div className="space-y-2 mb-4">
                        <div className="text-xs text-gray-500 font-medium">Consolidated Items ({batch.data.recipients.length})</div>
                        <div className="max-h-32 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                            {batch.data.sub_orders && batch.data.sub_orders.length > 0 ? (
                                batch.data.sub_orders.map((sub, i) => (
                                    <div key={i} className="flex justify-between items-center text-[11px] bg-white/5 p-2 rounded border border-white/5">
                                        <div className="flex flex-col">
                                            <span className="text-gray-300 font-medium">
                                                {sub.token_amount && sub.token_symbol
                                                    ? `${sub.token_amount} ${sub.token_symbol}`
                                                    : (sub.merchant_name || 'Item')}
                                            </span>
                                            <span className="text-[9px] text-gray-500 font-mono truncate max-w-[120px]">
                                                {sub.merchant_name || sub.merchant_did}
                                            </span>
                                        </div>
                                        <span className="text-indigo-300 font-bold">{(parseInt(sub.amount) / 1000000).toFixed(2)} USDC</span>
                                    </div>
                                ))
                            ) : (
                                batch.data.recipients.map((recipient, i) => (
                                    <div key={i} className="flex justify-between items-center text-[11px] bg-white/5 p-2 rounded border border-white/5">
                                        <span className="text-gray-400 truncate max-w-[120px] font-mono">{recipient}</span>
                                        <span className="text-indigo-300 font-bold">{(parseInt(batch.data.amounts[i]) / 1000000).toFixed(2)} USDC</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="bg-black/40 rounded p-2 border border-white/5 mb-4">
                        <div className="text-[9px] text-gray-600 font-mono mb-1 uppercase tracking-tighter">Integrity Signature (Batch)</div>
                        <div className="text-[10px] text-indigo-300/70 font-mono break-all leading-tight">
                            {batch.data.integrity_signature}
                        </div>
                    </div>
                </>
            )}

            <button
                onClick={() => setStatus('paid')}
                disabled={status === 'paid'}
                className={`w-full py-2.5 rounded-lg font-bold transition-all flex justify-center items-center gap-2 ${status === 'paid'
                    ? 'bg-green-600/20 text-green-500 border border-green-900/50 cursor-default'
                    : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg active:scale-95'
                    }`}
            >
                {status === 'paid' ? (isFullyDelivered ? 'All Assets Delivered' : 'Processing Delivery...') : 'Sign & Complete Batch Payment'}
            </button>
        </div>
    );
}
