import React from 'react';

const Infrastructure: React.FC = () => {
  return (
    <section id="features" className="py-16 sm:py-20 bg-background-dark/30 border-y border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          
          {/* Left Content */}
          <div className="order-2 lg:order-1">
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
              Enterprise-Grade <br/>
              <span className="text-primary">Agent Compliance</span>
            </h2>
            <p className="text-gray-400 text-base sm:text-lg mb-8">
              Prevent your agents from becoming tools for laundering. Nexus includes embedded identity verification and real-time risk scoring for every transaction.
            </p>
            
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex-shrink-0 flex items-center justify-center text-primary mt-1">
                  <span className="material-icons-round">gavel</span>
                </div>
                <div>
                  <h4 className="text-white font-bold text-lg">Anti-Money Laundering (AML)</h4>
                  <p className="text-gray-400 text-sm mt-1">Automatic screening against OFAC sanctions lists. Block high-risk wallets at the protocol level before settlement.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-accent-purple/20 flex-shrink-0 flex items-center justify-center text-accent-purple mt-1">
                  <span className="material-icons-round">verified</span>
                </div>
                <div>
                  <h4 className="text-white font-bold text-lg">Agent Verification</h4>
                  <p className="text-gray-400 text-sm mt-1">Ensure you are paying a verified bot. Cryptographic proofs bind agent identity to their reputation score.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-accent-cyan/20 flex-shrink-0 flex items-center justify-center text-accent-cyan mt-1">
                  <span className="material-icons-round">currency_exchange</span>
                </div>
                <div>
                  <h4 className="text-white font-bold text-lg">Stablecoin Liquidity</h4>
                  <p className="text-gray-400 text-sm mt-1">Native support for USDT and USDC on PlatON. No volatility risk for your merchants.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Image */}
          <div className="relative order-1 lg:order-2">
            <div className="absolute inset-0 bg-gradient-to-r from-primary to-accent-purple opacity-20 blur-3xl rounded-full"></div>
            <div className="glass-panel p-1 rounded-2xl relative overflow-hidden">
              <img 
                alt="Dashboard interface for payment monitoring" 
                className="w-full h-auto rounded-xl shadow-2xl opacity-80"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDwMwrp6bmhzXF5BDwR_jV5axdbKHCs0Fu8v0EgV0JfXlPtJ7tLiGdWNKdH89JmB1ZrX2jBXGQ7vTO99WmCFg7jkzEWOZW2SxCJuEdeYkNFIiueV_uey5yvqwqBdPfIR64S7uUwTYlP5DLsSO5F28D6IP3GfWJfWJCbrKsOfYPjA45e2GDBm6pDrERVMEbDoACSyhxDdOVYg23g77HV-l58rDoiyAiUeF9wCcRc1aihCwjg3OafqWQpTmiSkkvxqCpXpB1Bo_4xEov_"
              />
              
              {/* Floating Overlay Card */}
              <div className="absolute bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-6">
                <div className="glass-card p-3 sm:p-4 rounded-lg flex items-center gap-3 sm:gap-4 bg-background-dark/90 border border-white/20">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded bg-green-500/20 flex items-center justify-center text-green-400">
                    <span className="material-icons-round text-xl sm:text-2xl">security</span>
                  </div>
                  <div className="flex-1">
                    <div className="text-white font-bold text-sm">Risk Score: Low</div>
                    <div className="h-1.5 sm:h-2 w-full bg-white/10 rounded mt-1.5 overflow-hidden">
                       <div className="h-full w-[10%] bg-green-500 rounded"></div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-mono font-bold text-sm sm:text-base">Safe</div>
                    <div className="text-[10px] sm:text-xs text-gray-500">Authorized</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};

export default Infrastructure;