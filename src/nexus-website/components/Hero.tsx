import React from 'react';

const Hero: React.FC = () => {
  return (
    <section className="relative pt-24 pb-12 sm:pt-32 sm:pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
        
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold tracking-wide uppercase mb-6 sm:mb-8">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
          </span>
          The Clearing Layer for the AI Economy
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-6xl md:text-8xl font-bold text-white mb-6 tracking-tight leading-tight">
          <span className="block">AI Agents Can Now</span>
          <span className="block text-transparent bg-clip-text bg-gradient-to-r from-primary via-accent-cyan to-accent-purple text-glow">
            Pay Other Machines.
          </span>
        </h1>

        {/* Subhead */}
        <p className="mt-4 max-w-2xl mx-auto text-base sm:text-xl text-gray-400 font-light mb-2 px-4 sm:px-0">
          Programmatic stablecoin settlement for APIs, tools, and data marketplaces. 
          No credit cards, no human intervention, just code.
        </p>

        {/* Based On Tag */}
        <p className="text-sm font-mono text-gray-500 uppercase tracking-widest flex items-center justify-center gap-2 mt-6">
          <span className="w-2 h-2 rounded-full bg-platon-blue"></span>
          Powered by PlatON Network
        </p>

        {/* Visual Card - Transaction Simulator */}
        <div className="mt-12 sm:mt-20 relative rounded-2xl border border-white/10 overflow-hidden bg-background-dark/50 backdrop-blur-sm shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background-dark pointer-events-none z-10"></div>
          
          <img 
            alt="Abstract 3D network visualization" 
            className="w-full h-[300px] sm:h-[400px] object-cover opacity-60 mix-blend-screen"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuCW-shQSqPiZuJSI0KMVzJbmTSX01yLHPDJXkWwtiMCTrydquZpKOceKKJdSHnUfRiWdlSWpNSZpvOYxSJxz1Rw82sNGuKNyniB3sj_DLmbus-_vBzvCpNjR7e-vP_RJ3UEUWX_cDgwZAuPQQSO9Sa3AcNSHTYkJN8D7hzVHzI1M1wgf8JYtaV6fWf9Ae2rfLR71pNhcWTElyDEy7-HSC-l8-RKcrXlFjsiMgrCW1aZNqObG37jkW1xXL6XYCpCIBjJSNhiOuTpeaOw"
          />

          <div className="absolute inset-0 flex items-center justify-center z-20">
            <div className="glass-panel p-4 sm:p-8 rounded-xl max-w-lg w-full mx-4 border-t border-l border-white/20 shadow-[0_0_50px_rgba(37,106,244,0.15)]">
              
              {/* Card Header */}
              <div className="flex justify-between items-center mb-4 sm:mb-6 border-b border-white/10 pb-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_#22c55e]"></div>
                  <span className="text-[10px] sm:text-xs font-mono text-gray-400">TX_ID: 0x8a...4b2</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-icons-round text-xs sm:text-sm text-gray-400">verified</span>
                  <span className="text-[10px] sm:text-xs font-mono text-accent-cyan tracking-wider">SETTLED</span>
                </div>
              </div>

              {/* Transaction Flow */}
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 shrink-0">
                      <span className="material-icons-round text-gray-300 text-sm sm:text-base">smart_toy</span>
                    </div>
                    <div className="text-left">
                      <p className="text-xs sm:text-sm text-white font-medium">AutoGPT_V2</p>
                      <p className="text-[10px] sm:text-xs text-gray-500">Payer</p>
                    </div>
                  </div>
                  
                  <span className="material-icons-round text-gray-600 animate-pulse text-base sm:text-2xl">arrow_forward</span>
                  
                  <div className="flex items-center gap-2 sm:gap-3 text-right">
                    <div className="text-right">
                      <p className="text-xs sm:text-sm text-white font-medium">SearchAPI.io</p>
                      <p className="text-[10px] sm:text-xs text-gray-500">Merchant</p>
                    </div>
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 shrink-0">
                      <span className="material-icons-round text-gray-300 text-sm sm:text-base">dns</span>
                    </div>
                  </div>
                </div>

                <div className="bg-background-dark/80 rounded p-3 flex justify-between items-center border border-white/5">
                  <span className="text-[10px] sm:text-xs text-gray-400 font-mono">Instant Transfer</span>
                  <span className="text-xs sm:text-sm text-white font-mono font-bold">150.00 USDC</span>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;