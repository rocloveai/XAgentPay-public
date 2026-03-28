import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, Share2, Cpu, Database, FileCode } from 'lucide-react';
import { translations, Language } from '../i18n/translations';

const RevenueFlowAnimation = ({ lang = 'zh' }: { lang?: Language }) => {
  const [step, setStep] = useState(0);
  const t = translations[lang].revenue;
  
  const containerRef = useRef<HTMLDivElement>(null);
  const agentRef = useRef<HTMLDivElement>(null);
  const hubRef = useRef<HTMLDivElement>(null);
  const providerRefs = useRef<(HTMLDivElement | null)[]>([]);
  
  const [paths, setPaths] = useState({ toHub: '', toProviders: [] as string[] });

  useEffect(() => {
    const timer = setInterval(() => {
      setStep((prev) => (prev + 1) % 5);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const updatePaths = () => {
      if (!containerRef.current || !agentRef.current || !hubRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const agentRect = agentRef.current.getBoundingClientRect();
      const hubRect = hubRef.current.getBoundingClientRect();

      const hubCenterX = hubRect.left + hubRect.width / 2 - containerRect.left;
      const hubCenterY = hubRect.top + hubRect.height / 2 - containerRect.top;
      const hubRadius = (Math.min(hubRect.width, hubRect.height) / 2) * 0.6;

      // Detect layout: vertical (mobile) or horizontal (desktop)
      const isVertical = agentRect.bottom < hubRect.top - 10;

      let toHub: string;
      if (isVertical) {
        // Agent bottom-center → Hub top
        const agentX = agentRect.left + agentRect.width / 2 - containerRect.left;
        const agentY = agentRect.bottom - containerRect.top;
        const hubTopY = hubCenterY - hubRadius;
        toHub = `M ${agentX} ${agentY} C ${agentX} ${agentY + 40}, ${hubCenterX} ${hubTopY - 40}, ${hubCenterX} ${hubTopY}`;
      } else {
        const agentX = agentRect.right - containerRect.left;
        const agentY = agentRect.top + agentRect.height / 2 - containerRect.top;
        const hubLeftX = hubCenterX - hubRadius;
        toHub = `M ${agentX} ${agentY} L ${hubLeftX} ${hubCenterY}`;
      }

      const providerRects = providerRefs.current.map(ref => ref?.getBoundingClientRect());

      let toProviders: string[];
      if (isVertical) {
        // Hub bottom → each card's top-center: middle=straight, sides=symmetric curves
        const hubBottomY = hubCenterY + hubRadius;
        // Pre-calculate all rects for symmetry
        const provRects = providerRefs.current.map(ref => ref?.getBoundingClientRect());
        const leftX = provRects[0] ? provRects[0].left + provRects[0].width / 2 - containerRect.left : hubCenterX;
        const rightX = provRects[2] ? provRects[2].left + provRects[2].width / 2 - containerRect.left : hubCenterX;
        // Force symmetric offset around hub center
        const avgOffset = ((hubCenterX - leftX) + (rightX - hubCenterX)) / 2;
        const symLeftX = hubCenterX - avgOffset;
        const symRightX = hubCenterX + avgOffset;
        toProviders = providerRefs.current.map((ref, i) => {
          if (!ref) return '';
          const rect = provRects[i];
          if (!rect) return '';
          const targetY = rect.top - containerRect.top;
          if (i === 1) {
            // Middle: force vertical
            return `M ${hubCenterX} ${hubBottomY} L ${hubCenterX} ${targetY}`;
          }
          // Left (i=0) and right (i=2): guaranteed symmetric curves
          const symX = i === 0 ? symLeftX : symRightX;
          const midY = hubBottomY + (targetY - hubBottomY) * 0.5;
          return `M ${hubCenterX} ${hubBottomY} C ${hubCenterX} ${midY}, ${symX} ${midY}, ${symX} ${targetY}`;
        });
      } else {
        const commonTargetX = Math.min(...providerRects.filter(Boolean).map(r => r!.left)) - containerRect.left + 10;
        toProviders = providerRefs.current.map((ref, i) => {
          if (!ref) return '';
          const rect = ref.getBoundingClientRect();
          const targetY = rect.top + rect.height / 2 - containerRect.top;
          const startOffsetY = (i - 1) * 20;
          const startY = hubCenterY + startOffsetY;
          const startX = hubCenterX + Math.sqrt(Math.max(0, Math.pow(hubRadius, 2) - Math.pow(startOffsetY, 2)));
          const dx = commonTargetX - startX;
          const cp1x = startX + dx * 0.5;
          const cp2x = commonTargetX - dx * 0.5;
          return `M ${startX} ${startY} C ${cp1x} ${startY}, ${cp2x} ${targetY}, ${commonTargetX} ${targetY}`;
        });
      }

      setPaths({ toHub, toProviders });
    };

    const observer = new ResizeObserver(updatePaths);
    if (containerRef.current) observer.observe(containerRef.current);
    
    // Also observe the children in case they move
    if (agentRef.current) observer.observe(agentRef.current);
    if (hubRef.current) observer.observe(hubRef.current);
    providerRefs.current.forEach(ref => {
      if (ref) observer.observe(ref);
    });

    updatePaths();
    const timeout = setTimeout(updatePaths, 500);
    
    return () => {
      observer.disconnect();
      clearTimeout(timeout);
    };
  }, []);

  const providers = [
    { id: 'compute', name: t.flow.merchantA, amount: '45.00', icon: <Cpu className="w-4 h-4" />, color: 'text-cyan-400', border: 'border-cyan-500/30', bg: 'bg-cyan-500/5', particleColor: '#22d3ee' },
    { id: 'data', name: t.flow.merchantB, amount: '30.00', icon: <Database className="w-4 h-4" />, color: 'text-purple-400', border: 'border-purple-500/30', bg: 'bg-purple-500/5', particleColor: '#c084fc' },
    { id: 'model', name: t.flow.merchantC, amount: '25.00', icon: <FileCode className="w-4 h-4" />, color: 'text-blue-400', border: 'border-blue-500/30', bg: 'bg-blue-500/5', particleColor: '#60a5fa' },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto py-6 md:py-12 px-6 overflow-hidden relative">
      <div ref={containerRef} className="flex flex-col md:flex-row items-center justify-between gap-6 md:gap-12 relative">
        
        {/* Left: AI Agent */}
        <motion.div 
          ref={agentRef}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="relative z-10 w-48 md:w-64 p-4 md:p-8 rounded-2xl border border-black/5 dark:border-white/10 bg-white dark:bg-slate-900 shadow-2xl transition-colors mx-auto"
        >
          <div className="flex flex-col items-center text-center gap-3 md:gap-6">
            <div className="w-10 h-10 md:w-20 md:h-20 rounded-full bg-primary/10 flex items-center justify-center relative">
              <div className="absolute inset-0 rounded-full border border-primary/20 animate-ping" />
              <Zap className="w-5 h-5 md:w-10 md:h-10 text-primary fill-current" />
            </div>
            <div>
              <h3 className="text-xl font-bold dark:text-white text-slate-900 transition-colors">{t.flow.agent}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 transition-colors">{t.flow.sign}</p>
            </div>
            <div className="w-full py-3 px-4 rounded-xl bg-primary/5 border border-primary/20">
              <span className="text-lg font-mono font-bold text-primary">100.00 USDC</span>
            </div>
          </div>
        </motion.div>

        {/* Middle: XAgent Pay Hub */}
        <div ref={hubRef} className="relative flex items-center justify-center w-36 h-36 md:w-72 md:h-72">
          {/* Animated Rings */}
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 border border-dashed border-primary/30 rounded-full"
          />
          <motion.div 
            animate={{ rotate: -360 }}
            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            className="absolute inset-6 border border-dashed border-purple-500/20 rounded-full"
          />
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="absolute inset-12 border border-dashed border-cyan-500/20 rounded-full"
          />
          
          {/* Hub Core */}
          <motion.div 
            animate={step === 2 ? { scale: [1, 1.05, 1], boxShadow: ["0 0 20px rgba(11,80,218,0.2)", "0 0 40px rgba(11,80,218,0.4)", "0 0 20px rgba(11,80,218,0.2)"] } : {}}
            className="relative z-10 w-20 h-20 md:w-44 md:h-44 rounded-full bg-white dark:bg-slate-900 border-2 border-primary/50 shadow-[0_0_30px_rgba(11,80,218,0.3)] flex flex-col items-center justify-center text-center p-2 md:p-4 transition-colors"
          >
            <Share2 className="w-5 h-5 md:w-12 md:h-12 text-primary md:mb-2" />
            <h4 className="text-[10px] md:text-sm font-bold dark:text-white text-slate-900 transition-colors">XAgent Pay</h4>
            <div className="mt-0.5 md:mt-1 px-2 py-0.5 md:px-3 md:py-1 rounded-md bg-primary/10 border border-primary/30">
              <span className="text-[8px] md:text-[10px] font-bold text-primary uppercase tracking-widest">CLEARING</span>
            </div>
            
            {/* Status Indicators */}
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-2 py-0.5 md:px-3 md:py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-1 md:gap-1.5 backdrop-blur-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[9px] md:text-[10px] font-bold text-emerald-500 uppercase tracking-wider">{t.flow.settle}</span>
            </div>
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 px-2 py-0.5 md:px-3 md:py-1 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center gap-1 md:gap-1.5 backdrop-blur-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
              <span className="text-[9px] md:text-[10px] font-bold text-purple-500 uppercase tracking-wider">{t.flow.split}</span>
            </div>
          </motion.div>
        </div>

        {/* Flow Particles (Moved out for coordinate consistency) */}
        <AnimatePresence>
          {step === 1 && paths.toHub && (
            <motion.div
              initial={{ offsetDistance: "0%", opacity: 0 }}
              animate={{ offsetDistance: "100%", opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                offsetPath: `path("${paths.toHub}")`,
                offsetAnchor: 'center',
                position: 'absolute',
                top: 0,
                left: 0,
              }}
              className="hidden md:block w-4 h-4 rounded-full bg-primary shadow-[0_0_15px_rgba(11,80,218,1)] z-20"
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {step === 3 && paths.toProviders.length > 0 && (
            <>
              {providers.map((p, i) => (
                <motion.div
                  key={`particle-${p.id}`}
                  initial={{ offsetDistance: "0%", opacity: 0 }}
                  animate={{ offsetDistance: "100%", opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{
                    offsetPath: `path("${paths.toProviders[i]}")`,
                    offsetAnchor: 'center',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    backgroundColor: p.particleColor,
                    boxShadow: `0 0 12px ${p.particleColor}`
                  }}
                  className="hidden md:block w-3 h-3 rounded-full z-20"
                />
              ))}
            </>
          )}
        </AnimatePresence>

        {/* Right: Recipients */}
        <div className="grid grid-cols-3 gap-2 md:flex md:flex-col md:gap-6 w-full md:w-80 relative z-10">
          {providers.map((p, i) => (
            <motion.div
              key={p.id}
              ref={el => providerRefs.current[i] = el}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`rounded-2xl border ${p.border} ${p.bg} dark:bg-slate-900/50 backdrop-blur-sm shadow-xl group hover:scale-[1.03] transition-all duration-300
                p-2 flex flex-col items-center text-center gap-1
                md:p-5 md:flex-row md:items-center md:justify-between md:text-left md:gap-4`}
            >
              {/* Mobile: vertical layout */}
              <div className={`p-2 rounded-xl bg-white dark:bg-slate-800 shadow-sm ${p.color} md:p-3`}>
                {p.icon}
              </div>
              <div className="md:flex-1">
                <h4 className="text-[10px] md:text-sm font-bold dark:text-white text-slate-900 transition-colors leading-tight">{p.name}</h4>
                <p className="text-[8px] md:text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">Merchant {String.fromCharCode(65 + i)}</p>
              </div>
              <span className={`text-xs md:text-lg font-mono font-bold ${p.color}`}>{p.amount}</span>
            </motion.div>
          ))}
        </div>

        {/* Background Connecting Lines (Desktop) */}
        <svg className="absolute inset-0 w-full h-full -z-10" style={{ pointerEvents: 'none' }}>
          <defs>
            <linearGradient id="lineGradient" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="500" y2="500">
              <stop offset="0%" stopColor="#0B50DA" stopOpacity="0.2" />
              <stop offset="50%" stopColor="#0B50DA" stopOpacity="1" />
              <stop offset="100%" stopColor="#0B50DA" stopOpacity="0.2" />
            </linearGradient>
          </defs>
          
          {/* Line from Agent to Hub */}
          {paths.toHub && (
            <>
              <path 
                d={paths.toHub} 
                stroke="#0B50DA" 
                strokeWidth="4" 
                fill="none" 
                className="opacity-5 blur-[2px]"
              />
              <path 
                d={paths.toHub} 
                stroke="url(#lineGradient)" 
                strokeWidth="2" 
                strokeDasharray="6 6"
                fill="none" 
              />
            </>
          )}

          {/* Lines from Hub to Providers */}
          {paths.toProviders.map((path, i) => (
            path && (
              <React.Fragment key={i}>
                <path 
                  d={path} 
                  stroke="#0B50DA" 
                  strokeWidth="4" 
                  fill="none" 
                  className="opacity-5 blur-[2px]"
                />
                <path 
                  d={path} 
                  stroke="url(#lineGradient)" 
                  strokeWidth="2" 
                  strokeDasharray="6 6"
                  fill="none" 
                />
              </React.Fragment>
            )
          ))}
        </svg>
      </div>

      {/* Legend / Description */}
      <div className="mt-8 md:mt-20 text-center">
        <p className="text-base text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed transition-colors">
          {t.subtitle}
          <br />
          <span className="font-bold text-slate-900 dark:text-white mt-2 inline-block transition-colors">{t.subSubtitle}</span>
        </p>
      </div>
    </div>
  );
};

export default RevenueFlowAnimation;
