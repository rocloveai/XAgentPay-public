import { useState, useEffect } from 'react';

type Order = {
    id: string;
    symbol: string;
    amount: number;
    unitPrice: number;
    totalPriceUSD: number;
    status: string;
    createdAt: string;
};

export function MerchantDashboard() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchOrders = async () => {
        try {
            const res = await fetch('http://localhost:3002/api/orders');
            const data = await res.json();
            // Sort by newest first
            const sorted = data.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setOrders(sorted);
        } catch (error) {
            console.error("Failed to fetch orders", error);
        }
    };

    useEffect(() => {
        fetchOrders();
        const interval = setInterval(fetchOrders, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleConfirm = async (orderId: string) => {
        setLoading(true);
        try {
            await fetch('http://localhost:3002/api/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId })
            });
            await fetchOrders();
        } catch (error) {
            console.error("Failed to confirm order", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ width: '100%', maxWidth: '800px', margin: '0 auto', color: 'white' }}>
            <h2 style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>Merchant Dashboard</h2>

            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ background: 'rgba(0,0,0,0.3)', color: '#94a3b8' }}>
                            <th style={{ padding: '15px' }}>Order ID</th>
                            <th style={{ padding: '15px' }}>Asset</th>
                            <th style={{ padding: '15px' }}>Amount</th>
                            <th style={{ padding: '15px' }}>Total (USD)</th>
                            <th style={{ padding: '15px' }}>Status</th>
                            <th style={{ padding: '15px' }}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orders.length === 0 && (
                            <tr>
                                <td colSpan={6} style={{ padding: '20px', textAlign: 'center', opacity: 0.5 }}>
                                    No orders found.
                                </td>
                            </tr>
                        )}
                        {orders.map(order => (
                            <tr key={order.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '15px', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                                    {order.id.split('-').pop()}
                                </td>
                                <td style={{ padding: '15px', textTransform: 'capitalize' }}>{order.symbol}</td>
                                <td style={{ padding: '15px' }}>{order.amount}</td>
                                <td style={{ padding: '15px' }}>${order.totalPriceUSD.toFixed(2)}</td>
                                <td style={{ padding: '15px' }}>
                                    <span style={{
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        background: order.status === 'PAID' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                                        color: order.status === 'PAID' ? '#10b981' : '#eab308'
                                    }}>
                                        {order.status}
                                    </span>
                                </td>
                                <td style={{ padding: '15px' }}>
                                    {order.status === 'PENDING_PAYMENT' && (
                                        <button
                                            onClick={() => handleConfirm(order.id)}
                                            disabled={loading}
                                            style={{
                                                padding: '6px 12px',
                                                fontSize: '0.8rem',
                                                background: '#6366f1',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Confirm
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
