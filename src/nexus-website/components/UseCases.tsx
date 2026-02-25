import React from 'react';

const UseCases: React.FC = () => {
  const cases = [
    {
      title: "Autonomous Travel",
      icon: "flight_takeoff",
      color: "text-blue-400",
      desc: "An AI assistant books a multi-leg trip. Nexus automatically splits the payment: 80% to the Airline, 15% to the Hotel, and 5% to the Agent developer—instantly."
    },
    {
      title: "Data Marketplaces",
      icon: "insights",
      color: "text-purple-400",
      desc: "Trading bots pay for premium financial data on a 'per-query' basis. No subscriptions, just streaming micro-payments for the exact data consumed."
    },
    {
      title: "DePIN Compute",
      icon: "memory",
      color: "text-cyan-400",
      desc: "LLMs renting GPU power from decentralized grids. Nexus handles the high-frequency settlement between the AI model and the hardware provider."
    }
  ];

  return (
    <section className="py-20 sm:py-28 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <div>
            <span className="text-primary font-mono text-xs uppercase tracking-widest mb-2 block">Real World Scenarios</span>
            <h2 className="text-3xl md:text-5xl font-bold text-white">Example Use Cases</h2>
          </div>
          <p className="text-gray-400 max-w-md text-sm md:text-right">
            Replacing complex manual billing with instant, programmable logic.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cases.map((item, idx) => (
            <div key={idx} className="glass-card p-6 sm:p-8 rounded-2xl group hover:bg-white/5 transition-all">
              <div className={`w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center mb-6 border border-white/10 group-hover:scale-110 transition-transform ${item.color}`}>
                <span className="material-icons-round text-2xl">{item.icon}</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-3">{item.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default UseCases;