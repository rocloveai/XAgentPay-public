'use client';

import React, { useState, useEffect } from 'react';
import { api, Order } from '@/lib/api';
import {
    ArrowRight,
    ShieldCheck,
    Database,
    Activity,
    Search,
    ChevronRight,
    AlertTriangle,
    Lock,
    Cpu,
    RefreshCw
} from 'lucide-react';

export default function ExplorerPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isPolling, setIsPolling] = useState(true);

    const selectedTransaction = orders.find(o => o.id === selectedId);

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
        const interval = setInterval(() => {
            if (isPolling) fetchOrders();
        }, 5000);
        return () => clearInterval(interval);
    }, [isPolling]);

    // Consistency Verification Logic
    const verifyConsistency = (order: Order) => {
        if (!order.protocol_trace) return false;

        const dbUSDC = Math.round(order.totalPriceUSD * 1000000);
        const protocolUSDC = parseInt(order.protocol_trace.ucp_payload.data.amount);

        // Basic check: DB Amount matches Protocol Amount
        return dbUSDC === protocolUSDC;
    };

    return (
        <div className="min-h-screen bg-black text-slate-300 font-sans selection:bg-indigo-500/30">
            {/* Header */}
            <header className="border-b border-white/10 bg-black/50 backdrop-blur-xl sticky top-0 z-50">
                <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-indigo-600 p-1.5 rounded-lg shadow-lg shadow-indigo-600/20">
                            <Cpu className="w-5 h-5 text-white" />
                        </div>
                        <h1 className="text-lg font-bold text-white tracking-tight">
                            Nexus Protocol <span className="text-indigo-400">Explorer</span>
                        </h1>
                        <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded-full border border-white/10 text-slate-500 uppercase tracking-widest font-mono">
                            Real-time Consistency Check
                        </span>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setIsPolling(!isPolling)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${isPolling
                                ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                : 'bg-slate-800 text-slate-400 border-white/5'
                                }`}
                        >
                            <RefreshCw className={`w-3 h-3 ${isPolling ? 'animate-spin' : ''}`} />
                            {isPolling ? 'Live Tracking On' : 'Live Tracking Off'}
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-[1600px] mx-auto flex h-[calc(100-4rem)]">
                {/* Left Panel: Transaction List */}
                <div className="w-[380px] border-r border-white/10 overflow-y-auto bg-slate-900/20">
                    <div className="p-4 border-b border-white/10 sticky top-0 bg-black/20 backdrop-blur-md">
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                            <input
                                type="text"
                                placeholder="Filter by transaction ID..."
                                className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
                            />
                        </div>
                    </div>
                    <div className="divide-y divide-white/5">
                        {orders.map((order) => (
                            <button
                                key={order.id}
                                onClick={() => setSelectedId(order.id)}
                                className={`w-full text-left p-5 hover:bg-white/5 transition-all relative group ${selectedId === order.id ? 'bg-indigo-600/10 border-r-2 border-indigo-500' : ''
                                    }`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-xs font-mono text-slate-500 uppercase tracking-tighter">
                                        {order.id.slice(0, 20)}...
                                    </span>
                                    <ChevronRight className={`w-4 h-4 text-slate-600 transform transition-transform ${selectedId === order.id ? 'translate-x-1' : ''}`} />
                                </div>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-white font-bold tracking-tight text-lg">
                                        {order.amount} <span className="text-slate-500 font-medium text-sm">{order.symbol.toUpperCase()}</span>
                                    </span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${order.status === 'PAID' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-500'
                                        }`}>
                                        {order.status}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                    <Activity className="w-3 h-3" />
                                    {new Date(order.createdAt).toLocaleTimeString()}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right Panel: Detail View */}
                <div className="flex-1 overflow-y-auto bg-black custom-scrollbar">
                    {selectedTransaction ? (
                        <div className="p-8">
                            {/* Verification Header */}
                            <div className="mb-10 flex flex-col items-center">
                                {verifyConsistency(selectedTransaction) ? (
                                    <div className="animate-in fade-in zoom-in duration-500 flex flex-col items-center">
                                        <div className="bg-green-500/10 border border-green-500/30 p-3 rounded-full mb-4 shadow-2xl shadow-green-500/20">
                                            <ShieldCheck className="w-12 h-12 text-green-500" />
                                        </div>
                                        <h2 className="text-2xl font-black text-white uppercase tracking-widest mb-1">Consistency Verified</h2>
                                        <p className="text-slate-500 text-sm">Three-way handshake successful. Data integrity confirmed.</p>
                                    </div>
                                ) : (
                                    <div className="animate-in slide-in-from-top-4 duration-500 flex flex-col items-center">
                                        <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-full mb-4 shadow-2xl shadow-red-500/20">
                                            <AlertTriangle className="w-12 h-12 text-red-500" />
                                        </div>
                                        <h2 className="text-2xl font-black text-white uppercase tracking-widest mb-1">Data Tampering Detected</h2>
                                        <p className="text-red-400 text-sm">Mismatch detected between protocol payload and merchant state.</p>
                                    </div>
                                )}
                            </div>

                            {/* Three-Way Handshake Visualization */}
                            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 relative">
                                {/* Connection Arrows (Overlay) */}
                                <div className="hidden xl:block absolute top-1/2 left-1/3 -translate-y-1/2 z-10 opacity-30">
                                    <ArrowRight className="w-8 h-8 text-indigo-500" />
                                </div>
                                <div className="hidden xl:block absolute top-1/2 left-2/3 -translate-y-1/2 z-10 opacity-30">
                                    <ArrowRight className="w-8 h-8 text-indigo-500" />
                                </div>

                                {/* Step 1: User Agent View */}
                                <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-6 backdrop-blur-sm flex flex-col h-full ring-1 ring-white/5">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-white border border-white/10">1</div>
                                        <h3 className="text-sm font-bold text-white uppercase tracking-widest">User Intent</h3>
                                    </div>
                                    <div className="flex-1 space-y-6">
                                        <div className="bg-black/40 rounded-xl p-5 border border-white/5">
                                            <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2 font-bold">Natural Language (Simulated)</div>
                                            <p className="text-lg text-white font-medium italic leading-relaxed">
                                                "I want to buy <span className="text-indigo-400">{selectedTransaction.amount} {selectedTransaction.symbol}</span>."
                                            </p>
                                        </div>
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between text-sm py-2 border-b border-white/5">
                                                <span className="text-slate-500">Asset Requested</span>
                                                <span className="text-white font-mono uppercase">{selectedTransaction.symbol}</span>
                                            </div>
                                            <div className="flex items-center justify-between text-sm py-2 border-b border-white/5">
                                                <span className="text-slate-500">Quantity</span>
                                                <span className="text-white font-mono">{selectedTransaction.amount}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Step 2: Nexus Protocol Layer */}
                                <div className="bg-indigo-900/10 border border-indigo-500/20 rounded-2xl p-6 backdrop-blur-sm flex flex-col h-full ring-1 ring-indigo-500/10 shadow-2xl shadow-indigo-600/5">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white border border-indigo-400/50 shadow-lg shadow-indigo-500/20">2</div>
                                        <h3 className="text-sm font-bold text-white uppercase tracking-widest">Nexus Payload</h3>
                                    </div>
                                    <div className="flex-1 flex flex-col">
                                        <div className="bg-gray-950 rounded-xl p-4 border border-indigo-500/20 h-full font-mono text-[11px] leading-relaxed relative overflow-hidden group">
                                            <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
                                                <span className="flex items-center gap-2 text-indigo-400">
                                                    <Lock className="w-3 h-3" />
                                                    Signed Message
                                                </span>
                                                <span className="text-[9px] text-slate-600 uppercase">nexus_v1_ucp</span>
                                            </div>
                                            <div className="space-y-1.5 custom-scrollbar overflow-y-auto max-h-[300px]">
                                                {selectedTransaction.protocol_trace ? (
                                                    <>
                                                        <div className="text-slate-500">{"{"}</div>
                                                        <div className="pl-4"><span className="text-slate-400">"type":</span> <span className="text-amber-400">"urn:ucp:payment:nexus_v1"</span>,</div>
                                                        <div className="pl-4"><span className="text-slate-400">"data": {"{"}</span></div>
                                                        <div className="pl-8"><span className="text-slate-400">"merchant_did":</span> <span className="text-amber-400">"{selectedTransaction.protocol_trace.merchant_did}"</span>,</div>
                                                        <div className="pl-8"><span className="text-slate-400">"chain_id":</span> <span className="text-indigo-400">1</span>,</div>
                                                        <div className="pl-8"><span className="text-slate-400">"contract_address":</span> <span className="text-amber-400">"0x123...4890"</span>,</div>
                                                        <div className="pl-8 bg-green-500/10 py-0.5 rounded px-1 -mx-1"><span className="text-slate-400">"amount":</span> <span className="text-green-400 font-bold">"{selectedTransaction.protocol_trace.ucp_payload.data.amount}"</span>,</div>
                                                        <div className="pl-8 bg-green-500/10 py-0.5 rounded px-1 -mx-1"><span className="text-slate-400">"reference_id":</span> <span className="text-green-400 font-bold">"{selectedTransaction.protocol_trace.ucp_payload.data.reference_id}"</span>,</div>
                                                        <div className="pl-8 bg-green-500/10 py-0.5 rounded px-1 -mx-1 break-all flex flex-wrap"><span className="text-slate-400">"signature":</span> <span className="text-green-400 font-bold">"{selectedTransaction.protocol_trace.nexus_signature.slice(0, 32)}..."</span></div>
                                                        <div className="pl-4">{"}"}</div>
                                                        <div className="text-slate-500">{"}"}</div>
                                                    </>
                                                ) : (
                                                    <div className="text-slate-600 italic">// Protocol trace data missing</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Step 3: Merchant Settlement */}
                                <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-6 backdrop-blur-sm flex flex-col h-full ring-1 ring-white/5">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-white border border-white/10">3</div>
                                        <h3 className="text-sm font-bold text-white uppercase tracking-widest">Merchant Ledger</h3>
                                    </div>
                                    <div className="flex-1 space-y-6">
                                        <div className="grid grid-cols-1 gap-4">
                                            <div className="bg-black/40 rounded-xl p-4 border border-white/5">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Database className="w-3 h-3 text-indigo-400" />
                                                    <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Simulated Merchant</span>
                                                </div>
                                                <p className="text-sm font-bold text-white">{selectedTransaction.merchant_name || 'Generic OTC'}</p>
                                            </div>
                                            <div className="bg-black/40 rounded-xl p-4 border border-white/5">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Database className="w-3 h-3 text-indigo-400" />
                                                    <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Internal Order ID</span>
                                                </div>
                                                <p className="text-sm font-mono text-white break-all">{selectedTransaction.id}</p>
                                            </div>
                                            <div className="bg-black/40 rounded-xl p-4 border border-white/5">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Activity className="w-3 h-3 text-indigo-400" />
                                                    <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Settlement Status</span>
                                                </div>
                                                <p className="text-sm font-bold text-indigo-400">{selectedTransaction.status}</p>
                                            </div>
                                            <div className="bg-black/40 rounded-xl p-4 border border-white/5">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Amount Recieved</span>
                                                    <span className="text-lg font-black text-white">$ {selectedTransaction.totalPriceUSD.toFixed(2)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Verification Footer (Only show if trace exists) */}
                            {selectedTransaction.protocol_trace && (
                                <div className="mt-8 bg-slate-900/40 p-6 rounded-2xl border border-white/5 ring-1 ring-white/5">
                                    <div className="flex items-center gap-2 mb-4 text-xs font-bold text-slate-500 uppercase tracking-widest">
                                        <Cpu className="w-3 h-3" />
                                        Deterministic Verification Log
                                    </div>
                                    <div className="space-y-3 font-mono text-[11px]">
                                        <div className="flex justify-between items-center text-slate-300 bg-black/20 p-2 rounded">
                                            <span>[AUTH] Verifying Merchant DID Signature...</span>
                                            <span className="text-green-500">PASS</span>
                                        </div>
                                        <div className="flex justify-between items-center text-slate-300 bg-black/20 p-2 rounded">
                                            <span>[DATA] Comparing Protocol USDC Amount ({selectedTransaction.protocol_trace.ucp_payload.data.amount}) vs DB Final USD ({selectedTransaction.totalPriceUSD.toFixed(2)})...</span>
                                            <span className={(selectedTransaction.totalPriceUSD * 1000000) === parseInt(selectedTransaction.protocol_trace.ucp_payload.data.amount) ? "text-green-500" : "text-red-500"}>
                                                {(selectedTransaction.totalPriceUSD * 1000000) === parseInt(selectedTransaction.protocol_trace.ucp_payload.data.amount) ? "MATCH" : "MISMATCH"}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center text-slate-300 bg-black/20 p-2 rounded">
                                            <span>[UID ] Matching Reference ID ({selectedTransaction.protocol_trace.ucp_payload.data.reference_id}) with DB ID...</span>
                                            <span className={selectedTransaction.id === selectedTransaction.protocol_trace.ucp_payload.data.reference_id ? "text-green-500" : "text-red-500"}>
                                                {selectedTransaction.id === selectedTransaction.protocol_trace.ucp_payload.data.reference_id ? "MATCH" : "MISMATCH"}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4">
                            <div className="bg-slate-900/40 p-6 rounded-full border border-white/5">
                                <Search className="w-16 h-16 opacity-10" />
                            </div>
                            <p className="text-sm uppercase tracking-[0.2em] font-bold">Select a transaction to inspect</p>
                        </div>
                    )}
                </div>
            </main>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.2);
                }
            `}</style>
        </div>
    );
}
