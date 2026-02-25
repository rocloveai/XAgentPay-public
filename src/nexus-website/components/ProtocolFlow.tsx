import React from 'react';

const ProtocolFlow: React.FC = () => {
  return (
    <section className="py-16 sm:py-24 relative overflow-hidden bg-background-dark border-y border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center mb-12 sm:mb-20">
          <span className="text-accent-cyan font-mono text-xs uppercase tracking-widest mb-2 block">Orchestration Layer</span>
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">Automated Revenue Splitting</h2>
          <p className="text-gray-400 max-w-2xl mx-auto text-base sm:text-lg px-4 sm:px-0">
            Agents initiate one transaction. Nexus instantly routes funds to multiple service providers.
            <span className="text-white font-medium block mt-1">Non-custodial. No middleman wallets. No manual accounting.</span>
          </p>
        </div>

        {/* Visual Flow Area */}
        <div className="relative py-4 sm:py-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
            
            {/* Step 1: Agent */}
            <div className="relative group z-20 md:w-1/4 flex flex-col items-center w-full max-w-xs md:max-w-none">
              <div className="glass-card p-6 rounded-2xl border-primary/30 neon-box-shadow transform group-hover:scale-105 transition-all duration-500 bg-background-dark/80 relative w-full max-w-xs z-10">
                <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-primary flex items-center justify-center border-2 border-background-dark z-20 shadow-lg shadow-primary/50">
                  <span className="text-white text-xs font-bold">1</span>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4 border border-primary/40 group-hover:border-primary transition-colors">
                    <span className="material-symbols-outlined text-3xl text-primary">robot_2</span>
                  </div>
                  <h3 className="text-white font-bold text-lg mb-1">AI Agent</h3>
                  <p className="text-gray-400 text-xs text-center mb-3">Signs 1 Tx</p>
                  <div className="bg-primary/10 rounded px-3 py-1 border border-primary/20">
                    <span className="font-mono text-primary text-xs font-bold">100.00 USDC</span>
                  </div>
                </div>
              </div>
              
              {/* Mobile Line */}
              <div className="md:hidden h-12 w-0.5 bg-gradient-to-b from-primary to-transparent my-2"></div>
            </div>

            {/* Connecting Line (Desktop) - Enhanced Animation */}
            <div className="hidden md:block flex-1 h-[2px] relative bg-gray-800/30">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-accent-cyan/20"></div>
              
              {/* Data Packet */}
              <div className="absolute top-1/2 -translate-y-1/2 h-[3px] w-24 bg-gradient-to-r from-transparent via-primary to-white blur-[1px]" 
                   style={{ animation: 'transmitRight 2s cubic-bezier(0.4, 0, 0.2, 1) infinite' }}>
              </div>
              <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)]" 
                   style={{ animation: 'particleRight 2s cubic-bezier(0.4, 0, 0.2, 1) infinite' }}>
              </div>

              <style>{`
                @keyframes transmitRight {
                  0% { left: 0; opacity: 0; transform: scaleX(0.2); }
                  20% { opacity: 1; transform: scaleX(1); }
                  80% { opacity: 1; transform: scaleX(1); }
                  100% { left: 100%; opacity: 0; transform: scaleX(0.2); }
                }
                @keyframes particleRight {
                  0% { left: 0; opacity: 0; }
                  10% { opacity: 1; }
                  90% { opacity: 1; }
                  100% { left: 100%; opacity: 0; }
                }
              `}</style>
            </div>

            {/* Step 2: Nexus Core */}
            <div className="relative z-30 md:w-1/3 flex flex-col items-center">
              <div className="relative w-48 h-48 md:w-56 md:h-56 group">
                {/* Background Glow */}
                <div className="absolute inset-0 bg-accent-cyan/10 rounded-full blur-3xl animate-pulse-slow"></div>

                {/* Spinning Rings - Counter Rotating */}
                <div className="absolute inset-0 rounded-full border border-accent-cyan/30 border-t-accent-cyan border-l-transparent animate-spin-slow shadow-[0_0_15px_rgba(0,240,255,0.2)]"></div>
                <div className="absolute inset-4 rounded-full border border-accent-purple/30 border-b-accent-purple border-r-transparent animate-spin-slower"></div>
                <div className="absolute inset-8 rounded-full border border-primary/20 border-dashed animate-[spin_20s_linear_infinite]"></div>
                
                {/* Center Core */}
                <div className="absolute inset-0 m-auto w-32 h-32 md:w-40 md:h-40 glass-panel rounded-full flex flex-col items-center justify-center border-accent-cyan/50 shadow-[0_0_40px_rgba(0,240,255,0.15)] backdrop-blur-xl z-20 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-tr from-accent-cyan/10 to-transparent opacity-50"></div>
                  
                  {/* Inner Pulse */}
                  <div className="absolute inset-0 bg-accent-cyan/20 rounded-full animate-ping opacity-20" style={{ animationDuration: '2s' }}></div>

                  <span className="material-symbols-outlined text-4xl sm:text-5xl text-white mb-2 relative z-10 drop-shadow-[0_0_10px_rgba(0,240,255,0.8)]">hub</span>
                  <span className="text-white font-bold tracking-widest text-xs sm:text-sm relative z-10">NEXUS</span>
                  <div className="mt-1 px-2 py-0.5 bg-accent-cyan/10 border border-accent-cyan/30 rounded text-[10px] text-accent-cyan font-mono relative z-10 overflow-hidden">
                    <span className="animate-pulse">CLEARING</span>
                  </div>
                </div>

                {/* Status Pills */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-4 bg-background-dark/90 px-3 py-1 rounded-full border border-white/10 text-[10px] text-gray-300 shadow-lg z-30 whitespace-nowrap flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  Settlement
                </div>
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-4 bg-background-dark/90 px-3 py-1 rounded-full border border-white/10 text-[10px] text-gray-300 shadow-lg z-30 whitespace-nowrap flex items-center gap-1.5">
                  <span className="flex h-2 w-2 rounded-full bg-accent-purple animate-pulse"></span>
                  Splitting
                </div>
              </div>
            </div>

            {/* Splitting Lines (Desktop) - Enhanced with Particles */}
            <div className="hidden md:flex flex-1 relative h-40 items-center w-full">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 300 160" preserveAspectRatio="none" style={{ pointerEvents: 'none' }}>
                <defs>
                  <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.1" />
                    <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.8" />
                  </linearGradient>
                  <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#bd00ff" stopOpacity="0.1" />
                    <stop offset="100%" stopColor="#bd00ff" stopOpacity="0.8" />
                  </linearGradient>
                  <linearGradient id="grad3" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#256af4" stopOpacity="0.1" />
                    <stop offset="100%" stopColor="#256af4" stopOpacity="0.8" />
                  </linearGradient>
                  
                  <filter id="glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2.5" result="blur"/>
                    <feComposite in="SourceGraphic" in2="blur" operator="over"/>
                  </filter>
                  <filter id="glow-purple" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2.5" result="blur"/>
                    <feComposite in="SourceGraphic" in2="blur" operator="over"/>
                  </filter>
                  <filter id="glow-blue" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2.5" result="blur"/>
                    <feComposite in="SourceGraphic" in2="blur" operator="over"/>
                  </filter>
                </defs>

                {/* Path Definitions */}
                <path id="path1" d="M0,80 C100,80 150,30 300,30" fill="none" stroke="url(#grad1)" strokeWidth="1.5" strokeDasharray="4 4" className="opacity-40" vectorEffect="non-scaling-stroke" />
                <path id="path2" d="M0,80 C100,80 150,80 300,80" fill="none" stroke="url(#grad2)" strokeWidth="1.5" strokeDasharray="4 4" className="opacity-40" vectorEffect="non-scaling-stroke" />
                <path id="path3" d="M0,80 C100,80 150,130 300,130" fill="none" stroke="url(#grad3)" strokeWidth="1.5" strokeDasharray="4 4" className="opacity-40" vectorEffect="non-scaling-stroke" />

                {/* Animated Particles */}
                {/* Cyan Particle */}
                <circle r="3" fill="#00f0ff" filter="url(#glow-cyan)">
                  <animateMotion repeatCount="indefinite" dur="2s" begin="0.2s" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
                    <mpath href="#path1"/>
                  </animateMotion>
                  <animate attributeName="opacity" values="0;1;1;0" dur="2s" begin="0.2s" repeatCount="indefinite" />
                </circle>

                {/* Purple Particle */}
                <circle r="3" fill="#bd00ff" filter="url(#glow-purple)">
                  <animateMotion repeatCount="indefinite" dur="2s" begin="0.4s" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
                    <mpath href="#path2"/>
                  </animateMotion>
                  <animate attributeName="opacity" values="0;1;1;0" dur="2s" begin="0.4s" repeatCount="indefinite" />
                </circle>

                {/* Blue Particle */}
                <circle r="3" fill="#256af4" filter="url(#glow-blue)">
                  <animateMotion repeatCount="indefinite" dur="2s" begin="0.6s" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
                    <mpath href="#path3"/>
                  </animateMotion>
                  <animate attributeName="opacity" values="0;1;1;0" dur="2s" begin="0.6s" repeatCount="indefinite" />
                </circle>
              </svg>
            </div>
            
            {/* Mobile Line */}
            <div className="md:hidden h-12 w-0.5 bg-gradient-to-b from-transparent via-accent-cyan to-transparent my-2"></div>

            {/* Step 3: Services */}
            <div className="relative z-20 md:w-1/4 flex flex-col gap-4 w-full max-w-xs md:max-w-none">
              {/* Service A */}
              <div className="glass-card p-3 rounded-xl flex items-center gap-3 border-l-4 border-l-accent-cyan group hover:bg-white/5 transition-colors relative overflow-hidden">
                <div className="absolute inset-0 bg-accent-cyan/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="w-10 h-10 rounded-lg bg-accent-cyan/10 flex items-center justify-center shrink-0 border border-accent-cyan/20">
                  <span className="material-symbols-outlined text-accent-cyan text-sm">cloud_done</span>
                </div>
                <div className="flex-1 min-w-0 z-10">
                  <h4 className="text-white text-sm font-bold truncate">Compute Provider</h4>
                  <p className="text-gray-500 text-[10px]">Merchant A</p>
                </div>
                <div className="text-right z-10">
                  <span className="block text-accent-cyan font-mono text-xs font-bold">45.00</span>
                </div>
              </div>

              {/* Service B */}
              <div className="glass-card p-3 rounded-xl flex items-center gap-3 border-l-4 border-l-accent-purple group hover:bg-white/5 transition-colors relative overflow-hidden">
                <div className="absolute inset-0 bg-accent-purple/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="w-10 h-10 rounded-lg bg-accent-purple/10 flex items-center justify-center shrink-0 border border-accent-purple/20">
                  <span className="material-symbols-outlined text-accent-purple text-sm">database</span>
                </div>
                <div className="flex-1 min-w-0 z-10">
                  <h4 className="text-white text-sm font-bold truncate">Data Source</h4>
                  <p className="text-gray-500 text-[10px]">Merchant B</p>
                </div>
                <div className="text-right z-10">
                  <span className="block text-accent-purple font-mono text-xs font-bold">30.00</span>
                </div>
              </div>

              {/* Tool C */}
              <div className="glass-card p-3 rounded-xl flex items-center gap-3 border-l-4 border-l-primary group hover:bg-white/5 transition-colors relative overflow-hidden">
                <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                  <span className="material-symbols-outlined text-primary text-sm">construction</span>
                </div>
                <div className="flex-1 min-w-0 z-10">
                  <h4 className="text-white text-sm font-bold truncate">Model Royalty</h4>
                  <p className="text-gray-500 text-[10px]">Merchant C</p>
                </div>
                <div className="text-right z-10">
                  <span className="block text-primary font-mono text-xs font-bold">25.00</span>
                </div>
              </div>
            </div>

          </div>

          {/* Background decoration line */}
          <div className="absolute top-1/2 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary/5 to-transparent -translate-y-1/2 blur-2xl pointer-events-none"></div>
        </div>
      </div>
    </section>
  );
};

export default ProtocolFlow;