import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { shoppingAssistant } from './index.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json());

app.get('/api/agent-card', (req, res) => {
    res.json({
        id: "nexus-user-01",
        name: "Nexus Shopping Assistant",
        description: "Intelligent assistant for helping users find and buy crypto assets.",
        version: "1.0.0",
        capabilities: ["shopping_assistance", "intent_resolution"],
        endpoints: {
            chat: "http://localhost:3001/api/chat",
            discovery: "http://localhost:3001/api/agent-card"
        },
        flows: [
            {
                name: "shoppingAssistant",
                description: "Main chat flow for purchasing crypto",
                inputSchema: "string"
            }
        ]
    });
});

app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
    console.log('Received message:', message);

    try {
        const response = await shoppingAssistant(message);

        // response is now an object { text, paymentDetails? }

        let paymentData = response.paymentDetails || null;

        res.json({
            text: response.text,
            payment: paymentData,
            batchCard: (response as any).batchCard
        });
    } catch (error: any) {
        console.error('Error processing request:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`User Agent API Server running on http://localhost:${PORT}`);
});
