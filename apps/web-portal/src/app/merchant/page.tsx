'use client';

import React, { useState, useEffect } from 'react';
import { api, Order } from '@/lib/api';

export default function MerchantPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(false);
    const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

    const fetchOrders = async () => {
        try {
            const data = await api.getOrders();
            setOrders(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        } catch (error) {
            console.error(error);
        }
    };

    useEffect(() => {
        fetchOrders();
        const interval = setInterval(fetchOrders, 3000);
        return () => clearInterval(interval);
    }, []);

    const handleConfirm = async (id: string) => {
        setLoading(true);
        try {
            await api.confirmPayment(id);
            await fetchOrders();
        } catch (error) {
            alert('Failed to confirm payment');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-black text-gray-200 p-8 font-sans">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-8 border-b border-gray-800 pb-6">
                    <h1 className="text-3xl font-bold text-white tracking-tight">Merchant Dashboard</h1>
                    <div className="text-sm text-gray-500 flex items-center gap-2">
                        <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-500 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-600"></span>
                        </span>
                        Live Updates
                    </div>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-2xl">
                    <table className="w-full text-left">
                        <thead className="bg-gray-950 text-gray-400 uppercase text-xs tracking-wider">
                            <tr>
                                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-[10px] text-gray-500">Merchant</th>
                                <th className="px-6 py-4 font-semibold">Order ID</th>
                                <th className="px-6 py-4 font-semibold">Asset</th>
                                <th className="px-6 py-4 font-semibold">Amount</th>
                                <th className="px-6 py-4 font-semibold">Total (USD)</th>
                                <th className="px-6 py-4 font-semibold">Status</th>
                                <th className="px-6 py-4 font-semibold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {orders.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500 italic">
                                        No orders found. Use the Chat Interface to create one.
                                    </td>
                                </tr>
                            )}
                            {orders.map((order) => (
                                <React.Fragment key={order.id}>
                                    <tr className="hover:bg-gray-800/50 transition-colors cursor-pointer" onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}>
                                        <td className="px-6 py-4">
                                            <span className={`text-[10px] font-bold px-2 py-1 rounded border ${order.merchant_name?.includes('ETH')
                                                ? 'bg-indigo-900/40 text-indigo-400 border-indigo-800'
                                                : 'bg-orange-900/40 text-orange-400 border-orange-800'
                                                }`}>
                                                {order.merchant_name || 'Legacy'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-mono text-sm text-gray-500 truncate max-w-[150px]" title={order.id}>
                                            <span className="text-indigo-500 mr-2">{expandedOrder === order.id ? '▼' : '▶'}</span>
                                            {order.id.split('-').slice(2).join('-')}...
                                        </td>
                                        <td className="px-6 py-4 font-medium text-white capitalize">{order.symbol}</td>
                                        <td className="px-6 py-4 text-gray-300">{order.amount}</td>
                                        <td className="px-6 py-4 text-gray-300 font-mono">${order.totalPriceUSD.toFixed(2)}</td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${order.status === 'PAID'
                                                ? 'bg-green-900/30 text-green-400 border-green-800'
                                                : 'bg-yellow-900/30 text-yellow-500 border-yellow-800'
                                                }`}>
                                                {order.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {order.status === 'PENDING_PAYMENT' && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleConfirm(order.id); }}
                                                    disabled={loading}
                                                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4 py-2 rounded-lg transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                                                >
                                                    Confirm
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                    {expandedOrder === order.id && (
                                        <tr className="bg-gray-950/50">
                                            <td colSpan={7} className="px-6 py-6 border-l-2 border-indigo-500">
                                                <div className="space-y-4">
                                                    <div className="flex justify-between items-center">
                                                        <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-widest">ISO 20022 Data Details</h3>
                                                        <span className="text-[10px] text-gray-600 font-mono">pain.001.001.03 (JSON Representation)</span>
                                                    </div>
                                                    <div className="bg-gray-950 p-4 rounded-lg border border-gray-800 overflow-x-auto">
                                                        <pre className="text-xs text-gray-400 font-mono leading-relaxed">
                                                            {JSON.stringify(order.iso2022Data, null, 2) || "// No ISO 20022 data available for this order."}
                                                        </pre>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
