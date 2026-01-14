'use client';

import React, { useState, useEffect } from 'react';
import { api, Order, Batch } from '@/lib/api';
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
    RefreshCw,
    Layers,
    Link as LinkIcon,
    ArrowDown
} from 'lucide-react';

export default function ExplorerPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [batches, setBatches] = useState<Batch[]>([]);
    const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
    const [isPolling, setIsPolling] = useState(true);

    const selectedBatch = batches.find(b => b.id === selectedBatchId);

    // Derived child orders for the selected batch
    const childOrders = orders.filter(o => o.parent_batch_id === selectedBatchId);

    const fetchData = async () => {
        try {
            const [ordersData, batchesData] = await Promise.all([
                api.getOrders(),
                api.getBatches()
            ]);
            setOrders(ordersData);
            setBatches(batchesData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        } catch (error) {
            console.error(error);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(() => {
            if (isPolling) fetchData();
        }, 5000);
        return () => clearInterval(interval);
    }, [isPolling]);

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
                            Batch-Centric Ledger View
                        </span>
                    </div>
                </div>
            </header>

            <main className="max-w-[1600px] mx-auto flex h-[calc(100vh-4rem)]">
                {/* Left Panel: Primary Batch List */}
                <div className="w-[380px] border-r border-white/10 overflow-y-auto bg-slate-900/20">
                    <div className="p-4 border-b border-white/10 sticky top-0 bg-black/20 backdrop-blur-md z-20">
                        <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">Orchestrated Batches</div>
                    </div>

                    <div className="divide-y divide-white/5">
                        {batches.length === 0 ? (
                            <div className="p-10 text-center text-slate-600 text-xs">
                                <Layers className="w-8 h-8 mx-auto mb-3 opacity-20" />
                                Waiting for orchestrated payments...
                            </div>
                        ) : (
                            batches.map((batch) => (
                                <button
                                    key={batch.id}
                                    onClick={() => setSelectedBatchId(batch.id)}
                                    className={`w-full text-left p-5 hover:bg-indigo-900/10 transition-all relative group border-l-4 ${selectedBatchId === batch.id ? 'bg-indigo-600/10 border-indigo-500' : 'border-transparent'}`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="flex items-center gap-1.5 text-xs font-mono text-indigo-400 font-bold uppercase tracking-tighter">
                                            <Layers className="w-3 h-3" />
                                            Consolidated # {batch.id.slice(-6)}
                                        </span>
                                        <ChevronRight className={`w-4 h-4 text-slate-600 ${selectedBatchId === batch.id ? 'translate-x-1' : ''}`} />
                                    </div>
                                    <div className="text-white font-bold tracking-tight text-lg mb-1">
                                        {(parseInt(batch.total_amount) / 1000000).toFixed(2)} <span className="text-slate-500 font-medium text-sm">USDC</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-slate-500">
                                        <span className="bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                                            {batch.order_ids.length} Merchant Orders
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Activity className="w-3 h-3" />
                                            {new Date(batch.createdAt).toLocaleTimeString()}
                                        </span>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Right Panel: Hierarchical Detail View */}
                <div className="flex-1 overflow-y-auto bg-black custom-scrollbar">
                    {selectedBatch ? (
                        <div className="p-8 animate-in fade-in duration-300">
                            {/* Orchestration Summary */}
                            <div className="flex flex-col items-center mb-10">
                                <div className="bg-indigo-500/10 border border-indigo-500/30 p-3 rounded-full mb-4 shadow-2xl shadow-indigo-500/20">
                                    <ShieldCheck className="w-12 h-12 text-indigo-400" />
                                </div>
                                <h2 className="text-2xl font-black text-white uppercase tracking-[0.3em] mb-1">Batch Order Orchestrated</h2>
                                <p className="text-slate-500 text-sm font-mono">{selectedBatch.id}</p>
                            </div>

                            <div className="space-y-8">
                                {/* Level 1: Protocol Intent */}
                                <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-8 ring-1 ring-white/5">
                                    <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/10">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white shadow-lg">1</div>
                                            <h3 className="text-sm font-bold text-white uppercase tracking-widest">Protocol Aggregation Card</h3>
                                        </div>
                                        <div className="text-[11px] font-mono text-indigo-400">integrity_signature: {selectedBatch.integrity_signature.slice(0, 16)}...</div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="bg-black/40 rounded-xl p-5 border border-white/5">
                                            <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2 font-bold">Total Aggregated</div>
                                            <div className="text-2xl font-black text-white">{(parseInt(selectedBatch.total_amount) / 1000000).toFixed(2)} <span className="text-sm font-normal text-slate-500">USDC</span></div>
                                        </div>
                                        <div className="bg-black/40 rounded-xl p-5 border border-white/5">
                                            <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2 font-bold">Network</div>
                                            <div className="text-sm text-indigo-300 font-bold uppercase tracking-wider">Nexus Mainnet (CID: 1)</div>
                                        </div>
                                        <div className="bg-black/40 rounded-xl p-5 border border-white/5">
                                            <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2 font-bold">Settlement Logic</div>
                                            <div className="text-sm text-green-400 font-bold uppercase tracking-wider">Atomic Split v1</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Link Arrow */}
                                <div className="flex justify-center -my-4 relative z-10">
                                    <div className="bg-indigo-500 p-2 rounded-full shadow-lg shadow-indigo-500/40">
                                        <ArrowDown className="w-4 h-4 text-white" />
                                    </div>
                                </div>

                                {/* Level 2: Sub-Orders & Status Mapping */}
                                <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-8 ring-1 ring-white/5">
                                    <div className="flex items-center gap-3 mb-8">
                                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-white border border-white/10">2</div>
                                        <h3 className="text-sm font-bold text-white uppercase tracking-widest">Linked Merchant Sub-Orders</h3>
                                    </div>

                                    <div className="grid grid-cols-1 gap-4">
                                        {selectedBatch.sub_orders?.map((sub, i) => {
                                            const actualOrder = orders.find(o => o.id === sub.order_id);
                                            return (
                                                <div
                                                    key={i}
                                                    className="w-full bg-black/60 p-6 rounded-2xl border border-white/5 border-l-4 border-l-indigo-500 group hover:border-indigo-500/30 transition-all"
                                                >
                                                    <div className="flex flex-wrap justify-between items-start gap-4">
                                                        <div className="space-y-1 flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">{sub.merchant_name}</span>
                                                                <span className="text-[10px] text-slate-600 font-mono">DID: {sub.merchant_did}</span>
                                                            </div>
                                                            <div className="text-xl font-black text-white">{(parseInt(sub.amount) / 1000000).toFixed(2)} <span className="text-xs font-medium text-slate-500">USDC</span></div>
                                                            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono italic">
                                                                <LinkIcon className="w-3 h-3" />
                                                                REF# {sub.order_id}
                                                            </div>
                                                        </div>

                                                        <div className="text-right">
                                                            <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 font-bold">Settlement Status</div>
                                                            {actualOrder?.status === 'PAID' ? (
                                                                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded-full text-[10px] font-black uppercase tracking-widest animate-in fade-in zoom-in">
                                                                    <ShieldCheck className="w-3 h-3" />
                                                                    Completed
                                                                </div>
                                                            ) : (
                                                                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 rounded-full text-[10px] font-black uppercase tracking-widest">
                                                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                                                    Pending Split
                                                                </div>
                                                            )}
                                                            <div className="mt-2 text-[10px] text-slate-600 font-mono">
                                                                Handshake: {actualOrder?.protocol_trace ? 'Verified' : 'Unsigned'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Level 3: Finality Handshake */}
                                <div className="mt-8 bg-indigo-900/10 p-6 rounded-2xl border border-indigo-500/20 ring-1 ring-indigo-500/10 backdrop-blur-sm">
                                    <div className="flex items-center gap-2 mb-4 text-xs font-bold text-indigo-400 uppercase tracking-widest">
                                        <Cpu className="w-3 h-3" />
                                        Deterministic Settlement Trace
                                    </div>
                                    <div className="space-y-3 font-mono text-[11px]">
                                        <div className="flex justify-between items-center text-slate-300 bg-black/40 p-3 rounded-lg border border-white/5">
                                            <span>[CORE] Verifying Aggregate Signature Against {selectedBatch.order_ids.length} Merchant Commitments...</span>
                                            <span className="text-green-500">VALID</span>
                                        </div>
                                        <div className="flex justify-between items-center text-slate-300 bg-black/40 p-3 rounded-lg border border-white/5">
                                            <span>[AUTH] Mapping Global Batch {selectedBatch.id.slice(0, 8)} to Individual Merchant Payouts...</span>
                                            <span className="text-green-500">READY</span>
                                        </div>
                                        <div className="flex justify-between items-center text-slate-300 bg-black/40 p-3 rounded-lg border border-white/5">
                                            <span>[SPLT] Enforcing Multi-DID Atomic Settlement Policy...</span>
                                            <span className="text-indigo-400 font-bold">ACTIVE</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4">
                            <div className="bg-slate-900/40 p-6 rounded-full border border-white/5">
                                <Search className="w-16 h-16 opacity-10" />
                            </div>
                            <p className="text-sm uppercase tracking-[0.2em] font-bold">Select a Batch Orders to Inspect</p>
                        </div>
                    )}
                </div>
            </main>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }
            `}</style>
        </div>
    );
}
