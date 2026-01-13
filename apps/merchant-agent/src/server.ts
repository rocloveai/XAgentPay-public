import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { getOrders, confirmPayment, getOrderStatus, buyAsset } from './index.js';

const app = express();
const PORT = 3002;

app.use(cors());
app.use(bodyParser.json());

app.get('/api/agent-card', (req, res) => {
    res.json({
        id: "nexus-mer-01",
        name: "Nexus OTC Merchant",
        description: "Standard OTC Merchant providing crypto purchase services via NexusPay.",
        version: "1.0.0",
        capabilities: ["crypto_purchase", "ucp_payment"],
        endpoints: {
            payment: "http://localhost:3002/api/confirm",
            discovery: "http://localhost:3002/api/agent-card"
        },
        flows: [
            {
                name: "buyAsset",
                description: "Purchase crypto assets with USD/USDC",
                inputSchema: {
                    symbol: "string",
                    amount: "number"
                }
            }
        ]
    });
});

app.post('/api/buy', async (req, res) => {
    try {
        const result = await buyAsset(req.body);
        res.json(result);
    } catch (error: any) {
        console.error('Error in buyAsset:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/orders', async (req, res) => {
    try {
        const orders = await getOrders();
        res.json(orders);
    } catch (error: any) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/confirm', async (req, res) => {
    const { orderId } = req.body;
    try {
        const result = await confirmPayment({ orderId });
        res.json(result);
    } catch (error: any) {
        console.error('Error confirming payment:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/order-status/:id', async (req, res) => {
    try {
        const result = await getOrderStatus({ orderId: req.params.id });
        if (!result) return res.status(404).json({ error: 'Order not found' });
        res.json(result);
    } catch (error: any) {
        console.error('Error fetching order status:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Merchant Agent API Server running on http://localhost:${PORT}`);
});
