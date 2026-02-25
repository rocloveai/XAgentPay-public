import React from 'react';

const Developers: React.FC = () => {
  return (
    <section id="integration" className="py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center mb-12 sm:mb-16">
          <span className="text-accent-cyan uppercase tracking-widest text-xs sm:text-sm font-bold">Monetize Your Intelligence</span>
          <h2 className="text-3xl md:text-4xl font-bold text-white mt-2">Monetize in Minutes</h2>
          <p className="text-gray-400 mt-4 max-w-2xl mx-auto text-sm sm:text-base">
            Turn your AI agent or API into an autonomous earner. 
            Accept payments from other machines with zero friction.
          </p>
        </div>

        {/* 3 Step Process */}
        <div className="relative mt-8 sm:mt-12 mb-16 sm:mb-20">
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 sm:gap-8 relative z-10">
            {/* Step 1 */}
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl glass-panel flex items-center justify-center mb-4 sm:mb-6 relative group border-primary/30 bg-background-dark">
                <div className="absolute inset-0 bg-primary/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <span className="material-icons-round text-4xl sm:text-5xl text-white">storefront</span>
                <div className="absolute -bottom-3 px-3 py-1 bg-background-dark border border-white/10 rounded-full text-[10px] sm:text-xs text-gray-300 shadow-md">skill install</div>
              </div>
              <h4 className="text-lg sm:text-xl font-bold text-white">1. Install Commerce</h4>
              <p className="text-gray-400 text-xs sm:text-sm mt-2 px-4">
                <code>skill install @nexus/merchant</code><br/>
                Enable your agent to function as a paid service provider.
              </p>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col items-center text-center">
              <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full border-2 border-primary/50 bg-background-dark flex items-center justify-center mb-4 sm:mb-6 relative neon-border shadow-[0_0_30px_rgba(37,106,244,0.3)] z-10">
                <span className="material-icons-round text-5xl sm:text-6xl text-transparent bg-clip-text bg-gradient-to-br from-white to-primary">account_balance_wallet</span>
              </div>
              <h4 className="text-lg sm:text-xl font-bold text-white">2. Link Wallet</h4>
              <p className="text-gray-400 text-xs sm:text-sm mt-2 px-4">
                 <code>nexus auth --receive</code><br/>
                 Connect a PlatON wallet to receive instant settlements.
              </p>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl glass-panel flex items-center justify-center mb-4 sm:mb-6 relative group border-accent-purple/30 bg-background-dark">
                <div className="absolute inset-0 bg-accent-purple/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <span className="material-icons-round text-4xl sm:text-5xl text-white">payments</span>
                <div className="absolute -bottom-3 px-3 py-1 bg-background-dark border border-white/10 rounded-full text-[10px] sm:text-xs text-gray-300 shadow-md">auto-earn</div>
              </div>
              <h4 className="text-lg sm:text-xl font-bold text-white">3. Serve & Earn</h4>
              <p className="text-gray-400 text-xs sm:text-sm mt-2 px-4">Automatically service requests and accrue revenue.</p>
            </div>
          </div>
        </div>

        {/* Code Block */}
        <div className="mt-12 sm:mt-16 max-w-4xl mx-auto">
          <div className="rounded-xl overflow-hidden shadow-2xl bg-[#1e1e1e] border border-white/10 font-mono text-xs sm:text-sm relative">
            
            {/* Window Controls & Tab Bar */}
            <div className="bg-[#1e1e1e] pt-3 px-4 flex items-center justify-between border-b border-black/20">
              <div className="flex items-center">
                <div className="flex gap-2 mr-6 mb-2">
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-[#ff5f56]"></div>
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-[#ffbd2e]"></div>
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-[#27c93f]"></div>
                </div>
                
                <div className="bg-[#2d2d2d] px-3 py-1.5 rounded-t-lg text-gray-300 flex items-center gap-2 text-[10px] sm:text-xs border-t border-x border-black/20 relative top-[1px]">
                  <span className="material-icons-round text-[10px] sm:text-[12px] text-gray-400">terminal</span>
                  <span className="font-medium text-gray-200">merchant_service.py</span>
                </div>
              </div>
              
              <div className="flex items-center gap-2 mb-2 hidden sm:flex">
                <span className="text-xs text-gray-500">Python</span>
                <div className="w-2 h-2 rounded-full bg-blue-400"></div>
              </div>
            </div>

            {/* Editor Content */}
            <div className="bg-[#1e1e1e] p-4 sm:p-6 font-mono text-[11px] sm:text-[13px] leading-6 overflow-x-auto relative min-h-[200px] code-scroll">
              <div className="flex relative z-10">
                <div className="flex flex-col text-right text-[#6e7681] pr-4 sm:pr-6 select-none min-w-[1.5rem] sm:min-w-[2rem] border-r border-white/5 mr-4 sm:mr-6">
                  {Array.from({length: 10}).map((_, i) => (
                    <div key={i} className="h-6">{i + 1}</div>
                  ))}
                </div>

                <div className="flex-1 whitespace-pre">
                  <div className="h-6"><span className="text-[#c586c0]">from</span> <span className="text-[#9cdcfe]">nexus_agent</span> <span className="text-[#c586c0]">import</span> <span className="text-[#4ec9b0]">Agent</span></div>
                  <div className="h-6"></div>
                  <div className="h-6"><span className="text-[#6a9955]"># 1. Initialize Merchant Agent</span></div>
                  <div className="h-6"><span className="text-[#9cdcfe]">merchant</span> <span className="text-[#d4d4d4]">=</span> <span className="text-[#4ec9b0]">Agent</span>(<span className="text-[#9cdcfe]">name</span><span className="text-[#d4d4d4]">=</span><span className="text-[#ce9178]">'GPU_Cluster_01'</span>)</div>
                  <div className="h-6"><span className="text-[#9cdcfe]">merchant</span>.<span className="text-[#dcdcaa]">load_skill</span>(<span className="text-[#ce9178]">'@nexus/merchant'</span>)</div>
                  <div className="h-6"></div>
                  <div className="h-6"><span className="text-[#6a9955]"># 2. Define Paid Service Endpoint</span></div>
                  <div className="h-6"><span className="text-[#9cdcfe]">@merchant</span>.<span className="text-[#dcdcaa]">paid_service</span>(<span className="text-[#9cdcfe]">name</span><span className="text-[#d4d4d4]">=</span><span className="text-[#ce9178]">'inference'</span>, <span className="text-[#9cdcfe]">rate</span><span className="text-[#d4d4d4]">=</span><span className="text-[#ce9178]">'0.05 USDC/sec'</span>)</div>
                  <div className="h-6"><span className="text-[#c586c0]">def</span> <span className="text-[#dcdcaa]">run_inference</span>(<span className="text-[#9cdcfe]">prompt</span>):</div>
                  <div className="h-6">    <span className="text-[#c586c0]">return</span> <span className="text-[#9cdcfe]">gpu</span>.<span className="text-[#dcdcaa]">process</span>(<span className="text-[#9cdcfe]">prompt</span>)</div>
                  <div className="h-6"></div>
                  <div className="h-6"><span className="text-[#6a9955]"># 3. Start Listening for Payments</span></div>
                  <div className="h-6"><span className="text-[#9cdcfe]">merchant</span>.<span className="text-[#dcdcaa]">serve</span>()</div>
                </div>
              </div>
            </div>

            {/* Status Bar */}
            <div className="bg-[#3b82f6] text-white text-[10px] sm:text-[11px] py-1 px-4 flex justify-between items-center font-sans select-none">
              <div className="flex gap-4 sm:gap-6">
                <span className="font-semibold">main</span>
                <span>Ln 10, Col 1</span>
                <span>Python 3.11</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-[10px]">check_circle</span>
                <span>Listening</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
};

export default Developers;