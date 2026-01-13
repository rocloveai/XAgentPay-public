'use client';

import Link from 'next/link';
import {
  MessageSquare,
  LayoutDashboard,
  Layers,
  ShieldCheck,
  Cpu,
  ArrowRight,
  TrendingUp,
  Globe
} from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-[#050510] relative overflow-hidden font-sans selection:bg-indigo-500/30">
      {/* Dynamic Background Image with Overlay */}
      <div className="absolute inset-0 z-0">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-30 scale-105 animate-pulse-slow"
          style={{ backgroundImage: 'url("/bg-hero.png")' }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#050510]/80 via-[#050510]/60 to-[#050510]" />
      </div>

      {/* Hero Section */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-24 pb-32">
        <div className="text-center mb-20 space-y-6">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-1.5 rounded-full backdrop-blur-md mb-4 shadow-xl shadow-indigo-500/5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
            </span>
            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-[0.2em]">Next-Gen A2A Payment Framework</span>
          </div>

          <h1 className="text-7xl md:text-8xl font-black text-white tracking-tighter leading-[0.9]">
            Nexus<span className="text-indigo-500">Pay</span>
          </h1>

          <p className="text-slate-400 text-xl md:text-2xl font-medium max-w-2xl mx-auto tracking-tight leading-relaxed">
            Standardizing the future of <span className="text-white">Agent-to-Agent</span> commerce through programmable trust and verifiable intent.
          </p>
        </div>

        {/* Navigation Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
          {/* User App */}
          <Link href="/chat" className="group relative block bg-slate-900/40 border border-white/5 rounded-[2rem] p-10 hover:border-indigo-500/50 transition-all duration-500 shadow-2xl hover:shadow-indigo-500/10 hover:-translate-y-2">
            <div className="mb-6 p-4 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 w-fit group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500">
              <MessageSquare className="w-8 h-8 text-indigo-400 group-hover:text-white" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-4 flex items-center gap-2 group-hover:translate-x-2 transition-transform duration-500">
              User Agent <ArrowRight className="w-6 h-6 opacity-0 group-hover:opacity-100 -translate-x-4 group-hover:translate-x-0 transition-all duration-500" />
            </h2>
            <p className="text-slate-400 leading-relaxed">
              Experience intent-based shopping. Let the AI assistant resolve your payments across the Nexus network.
            </p>
          </Link>

          {/* Nexus Explorer */}
          <Link href="/explorer" className="group relative block bg-slate-900/40 border border-white/5 rounded-[2rem] p-10 hover:border-emerald-500/50 transition-all duration-500 shadow-2xl hover:shadow-emerald-500/10 hover:-translate-y-2">
            <div className="mb-6 p-4 rounded-2xl bg-emerald-600/10 border border-emerald-500/20 w-fit group-hover:bg-emerald-600 group-hover:text-white transition-all duration-500">
              <Layers className="w-8 h-8 text-emerald-400 group-hover:text-white" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-4 flex items-center gap-2 group-hover:translate-x-2 transition-transform duration-500">
              Explorer <ArrowRight className="w-6 h-6 opacity-0 group-hover:opacity-100 -translate-x-4 group-hover:translate-x-0 transition-all duration-500" />
            </h2>
            <p className="text-slate-400 leading-relaxed">
              Verify the three-way handshake. Audit real-time protocol traces and deterministic payment consistency.
            </p>
          </Link>

          {/* Merchant App */}
          <Link href="/merchant" className="group relative block bg-slate-900/40 border border-white/5 rounded-[2rem] p-10 hover:border-purple-500/50 transition-all duration-500 shadow-2xl hover:shadow-purple-500/10 hover:-translate-y-2">
            <div className="mb-6 p-4 rounded-2xl bg-purple-600/10 border border-purple-500/20 w-fit group-hover:bg-purple-600 group-hover:text-white transition-all duration-500">
              <LayoutDashboard className="w-8 h-8 text-purple-400 group-hover:text-white" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-4 flex items-center gap-2 group-hover:translate-x-2 transition-transform duration-500">
              Merchant <ArrowRight className="w-6 h-6 opacity-0 group-hover:opacity-100 -translate-x-4 group-hover:translate-x-0 transition-all duration-500" />
            </h2>
            <p className="text-slate-400 leading-relaxed">
              Manage settlement and liquidity. View ISO 20022 compliant order data and automated confirmation state.
            </p>
          </Link>
        </div>

        {/* Trust Badges */}
        <div className="mt-24 border-t border-white/5 pt-12 flex flex-wrap justify-center items-center gap-12 opacity-40 grayscale hover:grayscale-0 transition-all duration-700">
          <div className="flex items-center gap-2 text-white font-bold">
            <Cpu className="w-5 h-5 text-indigo-500" />
            <span className="text-sm tracking-widest uppercase">Genkit Core</span>
          </div>
          <div className="flex items-center gap-2 text-white font-bold">
            <Globe className="w-5 h-5 text-indigo-500" />
            <span className="text-sm tracking-widest uppercase">Cross-Chain UCP</span>
          </div>
          <div className="flex items-center gap-2 text-white font-bold">
            <ShieldCheck className="w-5 h-5 text-indigo-500" />
            <span className="text-sm tracking-widest uppercase">ISO 20022 Ready</span>
          </div>
          <div className="flex items-center gap-2 text-white font-bold">
            <TrendingUp className="w-5 h-5 text-indigo-500" />
            <span className="text-sm tracking-widest uppercase">Deterministic Settlement</span>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.25; transform: scale(1.05); }
          50% { opacity: 0.35; transform: scale(1.08); }
        }
        .animate-pulse-slow {
          animation: pulse-slow 8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
    </div>
  );
}
