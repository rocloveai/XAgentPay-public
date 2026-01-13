'use client';

import { useState, useRef, useEffect } from 'react';
import { api, ChatResponse } from '@/lib/api';
import { PaymentCard } from '@/components/PaymentCard';

interface Message {
    id: string;
    sender: 'user' | 'bot';
    text: string;
    data?: ChatResponse['payment'];
}

export default function ChatPage() {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([
        { id: '1', sender: 'bot', text: 'Hello! I am your Nexus Shopping Assistant. How can I help you today?' }
    ]);
    const [loading, setLoading] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMsg: Message = { id: Date.now().toString(), sender: 'user', text: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            const res = await api.chat(userMsg.text);
            const botMsg: Message = {
                id: (Date.now() + 1).toString(),
                sender: 'bot',
                text: res.text,
                data: res.payment
            };
            setMessages(prev => [...prev, botMsg]);
        } catch (error) {
            setMessages(prev => [...prev, { id: 'err', sender: 'bot', text: 'Sorry, I encountered an error connecting to the agent.' }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-gray-950 text-white">
            {/* Header */}
            <div className="p-4 border-b border-gray-800 bg-gray-900/50 backdrop-blur-md sticky top-0 z-10">
                <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                    Nexus Assistant
                </h1>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span> Online
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] md:max-w-[70%] p-4 rounded-2xl ${msg.sender === 'user'
                                ? 'bg-gradient-to-br from-indigo-600 to-purple-700 text-white rounded-br-sm shadow-lg'
                                : 'bg-gray-800/80 border border-gray-700 rounded-bl-sm text-gray-200'
                            }`}>
                            <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>

                            {/* Payment Card Render */}
                            {msg.data && (
                                <div className="mt-2">
                                    <PaymentCard data={msg.data} />
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-gray-800/80 p-3 rounded-2xl rounded-bl-sm text-gray-400 text-sm animate-pulse">
                            Thinking...
                        </div>
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="p-4 bg-gray-900/80 border-t border-gray-800">
                <div className="flex gap-2 max-w-4xl mx-auto">
                    <input
                        type="text"
                        className="flex-1 bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                        placeholder="Ask to buy something (e.g., 'buy 0.1 ETH')..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        disabled={loading}
                    />
                    <button
                        onClick={handleSend}
                        disabled={loading}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-[0_4px_14px_rgba(99,102,241,0.4)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
}
