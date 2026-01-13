import { useState, useRef, useEffect } from 'react';
import { MerchantDashboard } from './MerchantDashboard';

type PaymentData = {
  merchant: string;
  amount: string;
  cost: string;
  status: string;
};

type Message = {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  payment?: PaymentData;
};

function App() {
  const [view, setView] = useState<'user' | 'merchant'>('user');

  // Chat State
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', sender: 'bot', text: 'Hello! I am your Nexus Shopping Assistant. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (view === 'user') scrollToBottom();
  }, [messages, view]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: input
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg.text })
      });

      const data = await response.json();

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'bot',
        text: data.text || "Sorry, I couldn't understand that.",
        payment: data.payment
      };

      setMessages(prev => [...prev, botMsg]);

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        sender: 'bot',
        text: "Error: Could not connect to the assistant."
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <nav style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        padding: '15px 30px',
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 1000
      }}>
        <div style={{ fontWeight: 800, fontSize: '1.2rem', background: 'linear-gradient(to right, #00C6FF, #0072FF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          NexusPay
        </div>
        <div style={{ display: 'flex', gap: '20px' }}>
          <button
            onClick={() => setView('user')}
            style={{
              background: view === 'user' ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: view === 'user' ? 'white' : '#94a3b8',
              padding: '8px 16px',
              borderRadius: '20px'
            }}
          >
            Shopping Assistant
          </button>
          <button
            onClick={() => setView('merchant')}
            style={{
              background: view === 'merchant' ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: view === 'merchant' ? 'white' : '#94a3b8',
              padding: '8px 16px',
              borderRadius: '20px'
            }}
          >
            Merchant Dashboard
          </button>
        </div>
      </nav >

      <div style={{ marginTop: '80px', width: '100%', height: 'calc(100vh - 80px)', display: 'flex', justifyContent: 'center' }}>

        {view === 'merchant' ? (
          <MerchantDashboard />
        ) : (
          <div className="chat-container">
            {/* Header */}
            <div className="chat-header">
              <div className="avatar">N</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>Nexus Assistant</div>
                <div style={{ fontSize: '0.8rem', opacity: 0.7, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div className="status-dot"></div> Online
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="messages-area">
              {messages.map((msg) => (
                <div key={msg.id} className={`message ${msg.sender}`} style={{ width: msg.payment ? '100%' : 'auto' }}>
                  {msg.text.split('\n').map((line, i) => <div key={i}>{line}</div>)}

                  {/* Payment Card Visualization */}
                  {msg.payment && (
                    <div className="payment-card">
                      <div className="payment-header">
                        <div className="merchant-name">{msg.payment.merchant}</div>
                        <div className="status-badge">✔ {msg.payment.status}</div>
                      </div>
                      <div style={{ opacity: 0.8, fontSize: '0.9rem' }}>Payment Amount</div>
                      <div className="amount">{msg.payment.cost}</div>
                      <div style={{ marginTop: '10px', fontSize: '0.8rem', color: '#64748b' }}>
                        Asset: <span style={{ color: 'white' }}>{msg.payment.amount}</span>
                      </div>
                      <div className="signature">
                        sig: {msg.payment.status === 'Verified' ? '0x7b22...' : 'Pending'}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="message bot">
                  <span style={{ animation: 'pulse 1s infinite' }}>Typing...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="input-area">
              <input
                type="text"
                placeholder="Type a message..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                disabled={loading}
              />
              <button onClick={sendMessage} disabled={loading}>
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default App;
