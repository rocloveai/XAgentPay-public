'use client';

import React, { useState } from 'react';
import { PaymentData, api } from '@/lib/api';

interface PaymentCardProps {
    data: PaymentData;
}

export function PaymentCard({ data }: PaymentCardProps) {
    const [status, setStatus] = useState<'idle' | 'connecting' | 'signing' | 'processing' | 'paid'>(
        data.status === 'PAID' ? 'paid' : 'idle'
    );

    const handleSignAndPay = async () => {
        if (status !== 'idle') return;

        // 1. Check for MetaMask
        console.log("[PaymentCard] handleSignAndPay - Checking for ethereum object");
        const ethereum = (window as any).ethereum;
        if (!ethereum) {
            alert("MetaMask not found! Please install it.");
            return;
        }

        try {
            console.log("[PaymentCard] handleSignAndPay - Transitioning to connecting");
            setStatus('connecting');
            // 2. Request Accounts
            console.log("[PaymentCard] Requesting eth_requestAccounts...");
            const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
            console.log("[PaymentCard] Accounts received:", accounts);
            if (!accounts || accounts.length === 0) throw new Error("No accounts found");

            console.log("[PaymentCard] handleSignAndPay - Transitioning to signing");
            setStatus('signing');

            // 3. Simulate Signing (Personal Sign for demo)
            const msg = `NexusPay Order Confirmation\nMerchant: ${data.merchant}\nAmount: ${data.cost}\nOrder: ${data.orderId || 'Unknown'}`;
            console.log("[PaymentCard] Signing message:", msg);

            // Hex encode the message for personal_sign compatibility
            const hexMsg = '0x' + Array.from(new TextEncoder().encode(msg))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');

            console.log("[PaymentCard] Sending personal_sign request with hexMsg:", hexMsg);
            const signature = await ethereum.request({
                method: 'personal_sign',
                params: [hexMsg, accounts[0]],
            });
            console.log("[PaymentCard] Signature obtained successfully:", signature);

            console.log("[PaymentCard] handleSignAndPay - Transitioning to processing");
            // 4. Confirm on Backend
            setStatus('processing');
        } catch (error: any) {
            console.error("[PaymentCard] FATAL ERROR during handleSignAndPay:", error);
            alert("Payment failed or rejected: " + error.message);
            setStatus('idle');
        }
    };

    // Poll for status if in processing state
    React.useEffect(() => {
        let interval: NodeJS.Timeout;

        if (status === 'processing' && data.orderId) {
            interval = setInterval(async () => {
                try {
                    const result = await api.getOrderStatus(data.orderId!);
                    if (result.status === 'PAID') {
                        setStatus('paid');
                        clearInterval(interval);
                    }
                } catch (error) {
                    console.error("Polling error:", error);
                }
            }, 2000);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [status, data.orderId]);

    return (
        <div className="w-full bg-gradient-to-br from-gray-900 to-black rounded-xl p-5 mt-3 border border-gray-800 shadow-2xl relative overflow-hidden group">
            {/* Shimmer Effect */}
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12 translate-x-[-150%] animate-[shine_3s_infinite]" />

            <div className="flex justify-between items-start mb-4 border-b border-dashed border-gray-700 pb-3">
                <div>
                    <div className="text-xs text-indigo-400 uppercase tracking-widest font-bold mb-1">NEXUS OTC</div>
                    {/* Display Amount in Info Box as requested */}
                    <div className="text-2xl font-bold text-white tracking-tight">{data.cost}</div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${status === 'paid' ? 'bg-green-900/30 text-green-400 border-green-800' : 'bg-yellow-900/30 text-yellow-500 border-yellow-800'}`}>
                    {status === 'paid' ? 'PURCHASE SUCCESSFULLY' : (data.status === 'Verified' ? 'Verified' : data.status)}
                </span>
            </div>

            <div className="text-sm text-gray-500 mb-4">
                Purchasing: <span className="text-gray-300">{data.amount}</span>
            </div>

            <div className="bg-gray-900/50 rounded p-2 border border-gray-800">
                <div className="text-[10px] text-gray-500 font-mono break-all">
                    SIG: {data.signature || 'Pending Generation...'}
                </div>
            </div>

            {status === 'paid' ? (
                <button disabled className="w-full mt-4 bg-green-600/20 text-green-500 font-semibold py-2 rounded-lg cursor-default border border-green-900/50">
                    Purchase Successfully
                </button>
            ) : (
                <button
                    onClick={handleSignAndPay}
                    disabled={status !== 'idle'}
                    className="w-full mt-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-semibold py-2 rounded-lg transition-all active:scale-95 shadow-[0_0_15px_rgba(99,102,241,0.3)] flex justify-center items-center gap-2"
                >
                    {status === 'idle' && 'Sign & Pay with Nexus'}
                    {status === 'connecting' && 'Connecting Wallet...'}
                    {status === 'signing' && 'Waiting for Signature...'}
                    {status === 'processing' && 'Processing...'}
                </button>
            )}

            {/* Debug helper if stuck */}
            {(status === 'signing' || status === 'connecting') && (
                <div className="mt-2 text-center text-[10px] text-gray-600">
                    Stuck? <button onClick={() => setStatus('processing')} className="underline hover:text-indigo-400">Force Skip Signing (Debug)</button>
                </div>
            )}
        </div>
    );
}
