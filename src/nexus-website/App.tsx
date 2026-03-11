/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Globe, 
  ArrowRight, 
  Shield, 
  Zap, 
  Cpu, 
  Database, 
  Coins, 
  CheckCircle2, 
  Search, 
  Filter, 
  Heart, 
  Activity, 
  Code,
  Lock,
  Menu,
  X,
  ChevronRight,
  Plus,
  ExternalLink,
  Info,
  Sun,
  Moon,
  FileText,
  Sparkles,
  Copy
} from 'lucide-react';
import RevenueFlowAnimation from './components/RevenueFlowAnimation';
import { translations, Language } from './i18n/translations';

// --- Components ---

type PageType = 'home' | 'market' | 'privacy' | 'terms';

const Navbar = ({ lang, setLang, page, setPage, theme, setTheme }: {
  lang: Language,
  setLang: (l: Language) => void,
  page: PageType,
  setPage: (p: PageType) => void,
  theme: 'dark' | 'light',
  setTheme: (t: 'dark' | 'light') => void
}) => {
  const t = translations[lang].nav;
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-black/5 dark:border-white/5 bg-white/80 dark:bg-background-dark/80 backdrop-blur-md px-6 lg:px-20 py-4 transition-colors">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setPage('home')}>
            <div className="bg-primary p-1.5 rounded-lg">
              <Zap className="text-white w-5 h-5 fill-current" />
            </div>
            <div className="flex flex-col">
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{t.logo}</h2>
              <span className="text-[10px] font-bold text-primary tracking-widest leading-none">{t.label}</span>
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-8">
            <button 
              onClick={() => setPage('home')}
              className={`text-sm font-medium transition-colors ${page === 'home' ? 'text-primary' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
            >
              {t.home}
            </button>
            <button 
              onClick={() => setPage('market')}
              className={`text-sm font-medium transition-colors ${page === 'market' ? 'text-primary' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
            >
              {t.market}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded-lg border border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <div className="relative group hidden sm:block">
            <button className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white px-3 py-1.5 rounded-lg border border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5">
              <Globe className="w-4 h-4" />
              <span className="uppercase">{lang}</span>
            </button>
            <div className="absolute right-0 mt-2 w-32 py-2 bg-white dark:bg-slate-900 border border-black/10 dark:border-white/10 rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all shadow-2xl">
              {(['en', 'zh', 'ja', 'th'] as Language[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5 ${lang === l ? 'text-primary' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  {l === 'en' ? 'English' : l === 'zh' ? '中文' : l === 'ja' ? '日本語' : 'ไทย'}
                </button>
              ))}
            </div>
          </div>
          
          <button
            onClick={() => setPage('market')}
            className="bg-primary hover:bg-primary/90 text-white px-6 py-2 rounded-lg text-sm font-bold transition-all glow-effect hidden md:block"
          >
            {translations[lang].nav.listAgent}
          </button>

          <button className="md:hidden text-slate-500 dark:text-slate-400" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-black/5 dark:border-white/5 mt-4 py-4 flex flex-col gap-4"
          >
            <button onClick={() => { setPage('home'); setIsMenuOpen(false); }} className="text-left px-2 py-2 text-lg font-medium text-slate-900 dark:text-white">{t.home}</button>
            <button onClick={() => { setPage('market'); setIsMenuOpen(false); }} className="text-left px-2 py-2 text-lg font-medium text-slate-900 dark:text-white">{t.market}</button>
            <div className="flex gap-4 mt-2">
              {(['en', 'zh', 'ja', 'th'] as Language[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`text-sm font-bold uppercase ${lang === l ? 'text-primary' : 'text-slate-400 dark:text-slate-500'}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

const Hero = ({ lang }: { lang: Language }) => {
  const t = translations[lang].hero;
  return (
    <section className="relative pt-20 pb-32 px-6 overflow-hidden">
      <div className="absolute inset-0 grid-overlay -z-10" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[120px] -z-10" />
      
      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col gap-8"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 w-fit">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">{t.badge}</span>
          </div>

          <div className="flex flex-col gap-4">
            <h1 className="text-5xl lg:text-7xl font-bold leading-[1.1] tracking-tight text-slate-900 dark:text-white transition-colors">
              {t.title1} <br />
              <span className="text-gradient">{t.title2}</span>
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 max-w-xl leading-relaxed transition-colors">
              {t.subtitle}
            </p>
          </div>

          <div className="flex flex-wrap gap-4">
            <button className="bg-primary text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-primary/90 transition-all flex items-center gap-2 group">
              Get Started <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <div className="flex items-center gap-3 px-4 py-2 rounded-xl border border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 transition-colors">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400 transition-colors">{t.poweredBy}</span>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative flex justify-center"
        >
          <div className="w-full max-w-md aspect-[4/3] bg-white dark:bg-slate-900/50 rounded-3xl border border-black/5 dark:border-white/10 backdrop-blur-xl p-8 flex flex-col gap-6 shadow-2xl relative overflow-hidden transition-colors">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
            
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                  <Activity className="w-4 h-4 text-primary" />
                </div>
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Transaction_Live</span>
              </div>
              <div className="px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20">
                <span className="text-[10px] font-bold text-green-600 dark:text-green-500 uppercase tracking-wider">{t.demo.status}</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex justify-between items-center transition-colors">
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Payer</span>
                  <span className="font-mono text-sm text-slate-700 dark:text-slate-200">{t.demo.payer}</span>
                </div>
                
                <div className="flex-1 flex items-center justify-center px-4">
                  <div className="relative w-full h-4 flex items-center justify-center">
                    <div className="absolute w-full h-[1px] bg-slate-300 dark:bg-slate-700 opacity-20" />
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 20, opacity: [0, 1, 0] }}
                        transition={{ 
                          duration: 2, 
                          repeat: Infinity, 
                          delay: i * 0.6,
                          ease: "easeInOut" 
                        }}
                        className="absolute w-1 h-1 rounded-full bg-primary shadow-[0_0_8px_rgba(11,80,218,0.8)]"
                      />
                    ))}
                    <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-600 z-10" />
                  </div>
                </div>

                <div className="flex flex-col text-right">
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Merchant</span>
                  <span className="font-mono text-sm text-slate-700 dark:text-slate-200">{t.demo.merchant}</span>
                </div>
              </div>

              <div className="flex flex-col items-center py-4">
                <span className="text-4xl font-bold text-slate-900 dark:text-white mb-1 transition-colors">{t.demo.amount}</span>
                <span className="text-xs text-slate-500 uppercase tracking-widest font-bold">{t.demo.type}</span>
              </div>
            </div>

            <div className="mt-auto pt-4 border-t border-black/5 dark:border-white/5 flex justify-between items-center transition-colors">
              <div className="flex -space-x-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="w-6 h-6 rounded-full border-2 border-white dark:border-slate-900 bg-slate-200 dark:bg-slate-800 transition-colors" />
                ))}
              </div>
              <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">0x7a...f291</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

const ApiKeysSection = ({ lang }: { lang: Language }) => {
  const t = translations[lang].apiKeys;
  const cards = [t.card1, t.card2, t.card3];
  const icons = [Cpu, Zap, Shield];

  return (
    <section className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-4xl font-bold mb-4 text-slate-900 dark:text-white transition-colors">{t.title}</h2>
          <p className="text-slate-600 dark:text-slate-400 text-lg transition-colors">{t.subtitle}</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {cards.map((card, i) => {
            const Icon = icons[i];
            return (
              <motion.div 
                key={i}
                whileHover={{ y: -5 }}
                className="p-8 rounded-3xl bg-white dark:bg-slate-900/50 border border-black/5 dark:border-white/5 hover:border-primary/30 transition-all flex flex-col gap-6 shadow-sm dark:shadow-none"
              >
                <div className="flex justify-between items-start">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="px-2 py-1 rounded-md bg-black/5 dark:bg-white/5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">{card.tag}</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-3 text-slate-900 dark:text-white transition-colors">{card.title}</h3>
                  <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed transition-colors">{card.desc}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

const RevenueDistribution = ({ lang }: { lang: Language }) => {
  const t = translations[lang].revenue;
  return (
    <section className="py-24 px-6 bg-primary/5 relative overflow-hidden transition-colors">
      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-bold text-primary uppercase tracking-[0.2em]">{t.tag}</span>
          <h2 className="text-4xl lg:text-5xl font-bold mt-4 mb-6 text-slate-900 dark:text-white transition-colors">{t.title}</h2>
          <p className="text-slate-600 dark:text-slate-400 text-lg transition-colors">{t.subtitle}</p>
        </div>

        <RevenueFlowAnimation lang={lang} />
      </div>
    </section>
  );
};

const Compliance = ({ lang }: { lang: Language }) => {
  const t = translations[lang].compliance;
  return (
    <section className="py-24 px-6">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
        <div className="order-2 lg:order-1 relative">
          <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-black/5 dark:border-white/10 shadow-2xl relative overflow-hidden transition-colors">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white transition-colors">Compliance_Dashboard</h3>
              <div className="flex gap-2">
                <div className="w-2 h-2 rounded-full bg-slate-200 dark:bg-slate-700 transition-colors" />
                <div className="w-2 h-2 rounded-full bg-slate-200 dark:bg-slate-700 transition-colors" />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 transition-colors">
                <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">{t.risk.score}</span>
                <span className="text-2xl font-bold text-green-600 dark:text-green-500 transition-colors">{t.risk.low}</span>
              </div>
              <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 transition-colors">
                <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Status</span>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-500 transition-colors" />
                  <span className="text-lg font-bold text-slate-900 dark:text-white transition-colors">{t.risk.safe}</span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-primary" />
                <span className="text-sm font-bold text-primary uppercase tracking-widest">{t.risk.auth}</span>
              </div>
              <div className="text-[10px] font-mono text-primary/60">ID: 9283-AX-2025</div>
            </div>

            {/* Decorative elements */}
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-primary/20 rounded-full blur-3xl" />
          </div>
        </div>

        <div className="order-1 lg:order-2 flex flex-col gap-8">
          <div className="flex flex-col gap-4">
            <h2 className="text-4xl lg:text-5xl font-bold leading-tight text-slate-900 dark:text-white transition-colors">
              {t.title1} <br />
              <span className="text-gradient">{t.title2}</span>
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-lg transition-colors">{t.subtitle}</p>
          </div>

          <div className="space-y-6">
            {[t.feat1, t.feat2, t.feat3].map((feat, i) => (
              <div key={i} className="flex gap-4">
                <div className="mt-1">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                  </div>
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white mb-1 transition-colors">{feat.title}</h4>
                  <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed transition-colors">{feat.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

const Monetize = ({ lang }: { lang: Language }) => {
  const t = translations[lang].monetize;
  const [animationKey, setAnimationKey] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setAnimationKey(prev => prev + 1);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="py-24 px-6 bg-black/5 dark:bg-white/5 transition-colors">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-4">
            <span className="text-xs font-bold text-primary uppercase tracking-[0.2em]">{t.tag}</span>
            <h2 className="text-4xl lg:text-5xl font-bold leading-tight text-slate-900 dark:text-white transition-colors">{t.title}</h2>
            <p className="text-slate-600 dark:text-slate-400 text-lg transition-colors">{t.subtitle}</p>
          </div>

          <div className="space-y-8">
            {[t.step1, t.step2, t.step3].map((step, i) => (
              <div key={i} className="flex gap-6 relative">
                {i < 2 && <div className="absolute left-4 top-10 bottom-0 w-px bg-black/10 dark:bg-white/10 transition-colors" />}
                <div className="w-8 h-8 rounded-full bg-white dark:bg-slate-800 border border-black/10 dark:border-white/10 flex items-center justify-center text-sm font-bold text-primary relative z-10 transition-colors">
                  {i + 1}
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white mb-1 transition-colors">{step.title}</h4>
                  <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed transition-colors">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="bg-slate-50 dark:bg-slate-950 rounded-3xl border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden flex flex-col h-[600px] transition-colors relative">
            {/* Terminal Background Effects */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05] z-0">
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
              <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_2px,3px_100%]" />
            </div>

            {/* Header */}
            <div className="p-4 border-b border-black/5 dark:border-white/5 bg-slate-100 dark:bg-slate-900/50 flex items-center justify-between transition-colors relative z-10">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/40" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/40" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/40" />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-green-500/10 border border-green-500/20">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                  </span>
                  <span className="text-[9px] font-bold text-green-600 dark:text-green-500 uppercase tracking-tighter">Live</span>
                </div>
              </div>
            </div>

            {/* Chat Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 font-mono text-xs relative z-10 no-scrollbar">
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="flex gap-3"
              >
                <div className="w-6 h-6 rounded bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500 transition-colors flex-shrink-0">U</div>
                <div className="flex-1 p-3 rounded-xl bg-white dark:bg-slate-900 border border-black/5 dark:border-white/5 text-slate-700 dark:text-slate-300 transition-colors shadow-sm">
                  {t.chat.user.replace('[SKILL_URL]', SKILL_URL)}
                </div>
              </motion.div>

              <AnimatePresence mode="wait">
                <motion.div 
                  key={animationKey}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex gap-3"
                >
                  <div className="w-6 h-6 rounded bg-primary flex items-center justify-center text-white flex-shrink-0 shadow-[0_0_10px_rgba(11,80,218,0.3)]">A</div>
                  <div className="flex-1 space-y-4">
                    <div className="flex items-center gap-1">
                      <p className="text-slate-700 dark:text-slate-300 transition-colors">{t.chat.ai}</p>
                      <motion.div 
                        animate={{ opacity: [1, 0] }}
                        transition={{ duration: 0.8, repeat: Infinity }}
                        className="w-1.5 h-3 bg-primary/50"
                      />
                    </div>
                    
                    <div className="space-y-0 relative pl-1">
                      <div className="absolute left-[5px] top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-800 transition-colors" />
                      {[t.chat.log1, t.chat.log2, t.chat.log3, t.chat.log4, t.chat.log5, t.chat.log6].map((log, i) => (
                        <motion.div 
                          key={i}
                          initial={{ opacity: 0, x: -5 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.5 + (i * 0.3) }}
                          className="flex items-center gap-3 py-1.5 transition-colors group"
                        >
                          <div className="relative z-10 w-3 h-3 rounded-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center group-last:bg-green-500 group-last:border-green-500 transition-all">
                            <CheckCircle2 className="w-2.5 h-2.5 text-green-600 dark:text-green-500 group-last:text-white" />
                          </div>
                          <span className="text-green-600 dark:text-green-500/80 transition-colors group-last:text-green-600 dark:group-last:text-green-400 group-last:font-bold">{log}</span>
                        </motion.div>
                      ))}
                    </div>

                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 2.7 }}
                      className="p-4 rounded-xl bg-primary/5 border border-primary/20 text-slate-700 dark:text-slate-300 leading-relaxed transition-colors relative overflow-hidden group shadow-inner"
                    >
                      <div className="absolute top-0 left-0 w-1 h-full bg-primary opacity-50" />
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                          <CheckCircle2 className="w-2.5 h-2.5 text-primary" />
                        </div>
                        <p className="relative z-10">{t.chat.summary}</p>
                      </div>
                      <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-all" />
                    </motion.div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-black/5 dark:border-white/5 bg-slate-100 dark:bg-slate-900/50 transition-colors relative z-10">
              <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center italic transition-colors">{t.chat.footer}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

const UseCases = ({ lang }: { lang: Language }) => {
  const t = translations[lang].useCases;
  const cases = [
    { ...t.case1, icon: Globe },
    { ...t.case2, icon: Database },
    { ...t.case3, icon: Cpu },
  ];

  return (
    <section className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-bold text-primary uppercase tracking-[0.2em]">{t.tag}</span>
          <h2 className="text-4xl font-bold mt-4 mb-4 text-slate-900 dark:text-white transition-colors">{t.title}</h2>
          <p className="text-slate-600 dark:text-slate-400 text-lg transition-colors">{t.subtitle}</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {cases.map((c, i) => (
            <div key={i} className="p-8 rounded-3xl bg-white dark:bg-slate-900/30 border border-black/5 dark:border-white/5 hover:border-primary/20 transition-all group shadow-sm dark:shadow-none">
              <div className="w-12 h-12 rounded-2xl bg-black/5 dark:bg-white/5 flex items-center justify-center text-slate-500 dark:text-slate-400 group-hover:text-primary group-hover:bg-primary/10 transition-all mb-6">
                <c.icon className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-slate-900 dark:text-white transition-colors">{c.title}</h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed transition-colors">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const Footer = ({ lang, setPage }: { lang: Language; setPage: (p: PageType) => void }) => {
  const t = translations[lang].footer;
  const nav = translations[lang].nav;

  return (
    <footer className="py-20 px-6 border-t border-black/5 dark:border-white/5 transition-colors">
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-4 gap-12 mb-16">
          <div className="col-span-2 flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <div className="bg-primary p-1.5 rounded-lg">
                <Zap className="text-white w-5 h-5 fill-current" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white transition-colors">{nav.logo}</h2>
            </div>
            <p className="text-slate-600 dark:text-slate-400 max-w-xs transition-colors">{t.slogan}</p>
          </div>

          <div className="flex flex-col gap-4">
            <h4 className="font-bold text-slate-900 dark:text-white transition-colors">{t.community}</h4>
            <div className="flex flex-col gap-2">
              <a href="#" className="text-slate-500 hover:text-primary transition-colors">Twitter</a>
              <a href="#" className="text-slate-500 hover:text-primary transition-colors">Discord</a>
              <a href="#" className="text-slate-500 hover:text-primary transition-colors">GitHub</a>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <h4 className="font-bold text-slate-900 dark:text-white transition-colors">Legal</h4>
            <div className="flex flex-col gap-2">
              <button onClick={() => setPage('privacy')} className="text-left text-slate-500 hover:text-primary transition-colors">{t.privacy}</button>
              <button onClick={() => setPage('terms')} className="text-left text-slate-500 hover:text-primary transition-colors">{t.terms}</button>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-black/5 dark:border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 transition-colors">
          <p className="text-sm text-slate-500 dark:text-slate-600 transition-colors">{t.rights}</p>
          <div className="flex gap-6">
            <Globe className="w-4 h-4 text-slate-400 dark:text-slate-600 transition-colors" />
            <Shield className="w-4 h-4 text-slate-400 dark:text-slate-600 transition-colors" />
            <Lock className="w-4 h-4 text-slate-400 dark:text-slate-600 transition-colors" />
          </div>
        </div>
      </div>
    </footer>
  );
};

// --- Market Page ---

// --- API Configuration ---
const API_URL = import.meta.env.VITE_NEXUS_CORE_URL || "https://nexus-core-r0xf.onrender.com";
const SKILL_URL = `${API_URL}/skill.md`;
const MARKET_SKILL_URL = `${API_URL}/skill-market.md`;

const CHAIN_NAMES: Record<number, string> = {
  196: "XLayer Mainnet",
  20250407: "Nexus Devnet",
  1: "Ethereum",
  137: "Polygon",
};

interface SkillTool {
  name: string;
  role: string;
}

interface MarketAgent {
  merchant_did: string;
  name: string;
  description: string;
  category: string;
  skill_md_url: string | null;
  skill_user_url: string | null;
  health_status: "ONLINE" | "OFFLINE" | "DEGRADED" | "UNKNOWN";
  last_health_latency_ms: number | null;
  skill_name: string | null;
  skill_version: string | null;
  skill_tools: SkillTool[];
  currencies: string[];
  chain_id: number | null;
  is_verified: boolean;
  star_count: number;
}

const healthColor = (status: string) => {
  switch (status) {
    case "ONLINE": return "bg-green-500";
    case "DEGRADED": return "bg-yellow-500";
    case "OFFLINE": return "bg-red-500";
    default: return "bg-gray-500";
  }
};

const MarketPage = ({ lang }: { lang: Language }) => {
  const t = translations[lang].market;
  const [activeTab, setActiveTab] = useState<'discover' | 'list'>('discover');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [agents, setAgents] = useState<MarketAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [starredDids, setStarredDids] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('nexus_starred') || '[]')); }
    catch { return new Set(); }
  });

  // Fetch agents from real API
  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/api/market/agents`)
      .then(r => r.json())
      .then(data => { setAgents(data.agents ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Star/unstar agent
  const toggleStar = async (did: string) => {
    const isStarred = starredDids.has(did);
    const method = isStarred ? 'DELETE' : 'POST';
    try {
      await fetch(`${API_URL}/api/market/agents/${encodeURIComponent(did)}/star`, { method });
      setStarredDids(prev => {
        const next = new Set(prev);
        isStarred ? next.delete(did) : next.add(did);
        localStorage.setItem('nexus_starred', JSON.stringify([...next]));
        return next;
      });
      setAgents(prev => prev.map(a =>
        a.merchant_did === did ? { ...a, star_count: a.star_count + (isStarred ? -1 : 1) } : a
      ));
    } catch {}
  };

  const categories = [
    { id: 'all', label: t.discover.categories.all },
    { id: 'travel', label: t.discover.categories.travel },
    { id: 'food', label: t.discover.categories.food },
    { id: 'retail', label: t.discover.categories.retail },
    { id: 'entertainment', label: t.discover.categories.entertainment },
    { id: 'finance', label: t.discover.categories.finance },
    { id: 'services', label: t.discover.categories.services },
  ];

  const filteredAgents = agents.filter(a =>
    (category === 'all' || a.category === category) &&
    (a.name.toLowerCase().includes(search.toLowerCase()) || a.description.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="min-h-screen pt-12">
      <section className="px-6 mb-16">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-5xl lg:text-6xl font-bold mb-6 text-slate-900 dark:text-white transition-colors">
            {t.title1} <span className="text-gradient">{t.title2}</span>
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-lg max-w-2xl mx-auto mb-8 transition-colors">{t.subtitle}</p>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
            <Activity className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-primary">{t.count.replace('X', String(agents.length))}</span>
          </div>
        </div>
      </section>

      <section className="px-6 mb-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex border-b border-black/5 dark:border-white/10 mb-8 transition-colors">
            <button 
              onClick={() => setActiveTab('discover')}
              className={`px-8 py-4 font-bold transition-all relative ${activeTab === 'discover' ? 'text-primary' : 'text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'}`}
            >
              {t.tab1}
              {activeTab === 'discover' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
            </button>
            <button 
              onClick={() => setActiveTab('list')}
              className={`px-8 py-4 font-bold transition-all relative ${activeTab === 'list' ? 'text-primary' : 'text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'}`}
            >
              {t.tab2}
              {activeTab === 'list' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
            </button>
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'discover' ? (
              <motion.div 
                key="discover"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-12"
              >
                <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-black/5 dark:border-white/10 transition-colors shadow-sm dark:shadow-none">
                  <h3 className="text-xl font-bold mb-4 text-slate-900 dark:text-white transition-colors">{t.discover.title}</h3>
                  <p className="text-slate-600 dark:text-slate-400 mb-8 transition-colors">{t.discover.desc}</p>
                  
                  <div className="grid md:grid-cols-2 gap-8">
                    {/* Way A */}
                    <div className="p-6 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 transition-colors flex flex-col gap-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                          <FileText className="w-5 h-5" />
                        </div>
                        <h4 className="font-bold text-slate-900 dark:text-white transition-colors">{t.discover.wayA.title}</h4>
                      </div>
                      
                      <p className="text-sm text-slate-500 dark:text-slate-400">{t.discover.wayA.desc}</p>
                      
                      <div className="p-4 rounded-xl bg-slate-950/5 dark:bg-black/40 border border-black/5 dark:border-white/5">
                        <p className="text-sm italic text-cyan-600 dark:text-cyan-400 mb-4">{t.discover.wayA.prompt}</p>
                        <div className="space-y-2">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t.discover.wayA.listTitle}</p>
                          <ul className="space-y-1">
                            {t.discover.wayA.steps.map((step: string, i: number) => (
                              <li key={i} className="text-xs text-slate-600 dark:text-slate-400 flex gap-2">
                                <span className="text-slate-400">{i + 1}.</span> {step}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* Way B */}
                    <div className="p-6 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 transition-colors flex flex-col gap-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <h4 className="font-bold text-slate-900 dark:text-white transition-colors">{t.discover.wayB.title}</h4>
                      </div>
                      
                      <p className="text-sm text-slate-500 dark:text-slate-400">{t.discover.wayB.desc}</p>
                      
                      <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-950/5 dark:bg-black/40 border border-black/5 dark:border-white/5">
                        <ExternalLink className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                        <span className="text-xs font-mono text-cyan-600 dark:text-cyan-400 flex-1 truncate">{MARKET_SKILL_URL}</span>
                        <button
                          onClick={() => navigator.clipboard.writeText(MARKET_SKILL_URL)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-[10px] font-bold text-primary hover:bg-primary/20 transition-all"
                        >
                          <Copy className="w-3 h-3" /> Copy URL
                        </button>
                      </div>

                      <div className="p-4 rounded-xl bg-slate-950/5 dark:bg-black/40 border border-black/5 dark:border-white/5">
                        <p className="text-sm italic text-cyan-600 dark:text-cyan-400 mb-4">{t.discover.wayB.prompt}</p>
                        <div className="space-y-2">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t.discover.wayB.listTitle}</p>
                          <ul className="space-y-1">
                            {t.discover.wayB.steps.map((step: string, i: number) => (
                              <li key={i} className="text-xs text-slate-600 dark:text-slate-400 flex gap-2">
                                <span className="text-slate-400">{i + 1}.</span> {step}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
                    <div className="relative w-full md:w-96">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input 
                        type="text" 
                        placeholder={t.discover.search}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-black/10 dark:border-white/10 rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:border-primary transition-all text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="flex gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 no-scrollbar">
                      {categories.map(cat => (
                        <button
                          key={cat.id}
                          onClick={() => setCategory(cat.id)}
                          className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${category === cat.id ? 'bg-primary text-white' : 'bg-black/5 dark:bg-white/5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'}`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {loading ? (
                    <div className="flex justify-center py-20">
                      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredAgents.map((agent) => (
                      <motion.div
                        key={agent.merchant_did}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-black/5 dark:border-white/5 hover:border-primary/20 transition-all flex flex-col gap-6 group shadow-sm dark:shadow-none"
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <h4 className="text-lg font-bold group-hover:text-primary transition-colors text-slate-900 dark:text-white">{agent.name}</h4>
                              {agent.is_verified && (
                                <CheckCircle2 className="w-4 h-4 text-primary fill-primary/20" />
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <div className={`w-1.5 h-1.5 rounded-full ${healthColor(agent.health_status)}`} />
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                {agent.health_status}{agent.skill_version ? ` | ${agent.skill_version}` : ''}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => toggleStar(agent.merchant_did)}
                            className={`transition-colors ${starredDids.has(agent.merchant_did) ? 'text-red-500' : 'text-slate-400 hover:text-red-500'}`}
                          >
                            <Heart className={`w-5 h-5 ${starredDids.has(agent.merchant_did) ? 'fill-current' : ''}`} />
                            {agent.star_count > 0 && (
                              <span className="text-[10px] block text-center mt-0.5">{agent.star_count}</span>
                            )}
                          </button>
                        </div>

                        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed transition-colors">{agent.description}</p>

                        {/* Currencies */}
                        {agent.currencies.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {agent.currencies.map((c, j) => (
                              <span key={j} className="px-2 py-0.5 rounded bg-cyan-500/10 text-[10px] font-bold text-cyan-500 border border-cyan-500/20">{c}</span>
                            ))}
                          </div>
                        )}

                        {/* Tools */}
                        <div className="flex flex-wrap gap-2">
                          {agent.skill_tools.map((tool, j) => (
                            <span key={j} className="px-2 py-1 rounded bg-primary/10 text-[10px] font-mono text-primary border border-primary/20 transition-colors">{tool.name}</span>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-black/5 dark:border-white/5 transition-colors">
                          <div className="flex flex-col">
                            <span className="text-[10px] text-slate-400 dark:text-slate-600 uppercase font-bold transition-colors">{t.discover.card.latency}</span>
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors">
                              {agent.last_health_latency_ms != null ? `${agent.last_health_latency_ms}ms` : '—'}
                            </span>
                          </div>
                          <div className="flex flex-col text-right">
                            <span className="text-[10px] text-slate-400 dark:text-slate-600 uppercase font-bold transition-colors">{t.discover.card.network}</span>
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors">
                              {agent.chain_id ? (CHAIN_NAMES[agent.chain_id] || `Chain ${agent.chain_id}`) : '—'}
                            </span>
                          </div>
                        </div>

                        <a
                          href={agent.skill_user_url || agent.skill_md_url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full py-3 rounded-xl border border-primary/20 text-primary font-bold text-sm hover:bg-primary hover:text-white transition-all text-center block"
                        >
                          {t.discover.card.viewSkill}
                        </a>
                      </motion.div>
                    ))}
                    {filteredAgents.length === 0 && !loading && (
                      <div className="col-span-full text-center py-12 text-slate-400">
                        No agents found.
                      </div>
                    )}
                  </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="list"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid lg:grid-cols-2 gap-16"
              >
                <div className="space-y-12">
                  <div className="flex flex-col gap-4">
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white transition-colors">{t.list.title}</h3>
                    <div className="space-y-6">
                      {t.list.steps.map((step, i) => (
                        <div key={i} className="flex gap-4 items-center">
                          <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                            {i + 1}
                          </div>
                          <span className="text-lg text-slate-700 dark:text-slate-300 transition-colors">{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-black/5 dark:border-white/10 transition-colors shadow-sm dark:shadow-none">
                    <div className="flex items-center gap-3 mb-6">
                      <Code className="text-primary w-6 h-6" />
                      <h4 className="text-xl font-bold text-slate-900 dark:text-white transition-colors">{t.list.api}</h4>
                    </div>
                    <div className="bg-black/5 dark:bg-black/50 rounded-xl p-4 font-mono text-xs text-primary mb-6 transition-colors">
                      POST /api/market/register
                    </div>
                    <div className="grid sm:grid-cols-2 gap-8">
                      <div>
                        <h5 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4 transition-colors">{t.list.required}</h5>
                        <ul className="space-y-2 text-xs text-slate-500 dark:text-slate-400 transition-colors">
                          <li>• merchant_did</li>
                          <li>• name</li>
                          <li>• description</li>
                          <li>• category</li>
                          <li>• signer_address</li>
                          <li>• payment_address</li>
                          <li>• skill_md_url</li>
                          <li>• health_url</li>
                        </ul>
                      </div>
                      <div>
                        <h5 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4 transition-colors">{t.list.optional}</h5>
                        <ul className="space-y-2 text-xs text-slate-500 dark:text-slate-400 transition-colors">
                          <li>• webhook_url</li>
                          <li>• webhook_secret</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="relative">
                  <div className="sticky top-32 p-8 rounded-3xl bg-primary/5 border border-primary/10 flex flex-col gap-8">
                    <div className="flex flex-col gap-2">
                      <h3 className="text-2xl font-bold text-slate-900 dark:text-white transition-colors">Ready to scale?</h3>
                      <p className="text-slate-600 dark:text-slate-400 transition-colors">Join the ecosystem of autonomous commercial agents.</p>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase transition-colors">Merchant DID</label>
                        <input type="text" placeholder="did:nexus:..." className="bg-white dark:bg-slate-900 border border-black/10 dark:border-white/10 rounded-xl p-3 focus:outline-none focus:border-primary transition-all text-slate-900 dark:text-white" />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase transition-colors">Skill.md URL</label>
                        <input type="text" placeholder="https://..." className="bg-white dark:bg-slate-900 border border-black/10 dark:border-white/10 rounded-xl p-3 focus:outline-none focus:border-primary transition-all text-slate-900 dark:text-white" />
                      </div>
                    </div>

                    <button className="w-full bg-primary text-white py-4 rounded-xl font-bold hover:bg-primary/90 transition-all">Submit for Review</button>
                    
                    <div className="flex items-center gap-2 justify-center text-slate-500">
                      <Info className="w-4 h-4" />
                      <span className="text-xs">Review typically takes 24-48 hours.</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </div>
  );
};

// --- Legal Pages ---

const legalSectionClass = "text-slate-700 dark:text-slate-300 leading-relaxed transition-colors";
const legalHeading2 = "text-xl font-bold text-slate-900 dark:text-white mt-10 mb-4 transition-colors";
const legalHeading3 = "text-lg font-semibold text-slate-800 dark:text-slate-200 mt-6 mb-3 transition-colors";

const PrivacyPolicyPage = ({ lang }: { lang: Language }) => {
  return (
    <section className="py-20 px-6">
      <div className="max-w-3xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/20 bg-primary/5 text-primary text-sm font-medium mb-6">
            <Shield className="w-4 h-4" />
            <span>Legal</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4 transition-colors">
            Privacy Policy
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mb-12 transition-colors">
            Last updated: March 10, 2026
          </p>

          <div className={legalSectionClass}>
            <p className="mb-6">
              XAgent Pay (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) operates the xagenpay.com website and the XAgent Pay protocol. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website or use our services.
            </p>

            <h2 className={legalHeading2}>1. Information We Collect</h2>
            <h3 className={legalHeading3}>1.1 Blockchain Data</h3>
            <p className="mb-4">
              When you interact with the XAgent Pay protocol, your transactions are recorded on the XLayer blockchain. This includes wallet addresses, transaction hashes, amounts, and timestamps. This data is publicly available on the blockchain and cannot be deleted.
            </p>
            <h3 className={legalHeading3}>1.2 Agent Registration Data</h3>
            <p className="mb-4">
              When you register an AI agent on our marketplace, we collect the agent name, description, endpoint URL, skill manifest URL, payment address, and category information.
            </p>
            <h3 className={legalHeading3}>1.3 Automatically Collected Data</h3>
            <p className="mb-4">
              We may automatically collect certain information when you visit our website, including your IP address, browser type, operating system, referring URLs, and pages viewed. This information is used for analytics and to improve our services.
            </p>

            <h2 className={legalHeading2}>2. How We Use Your Information</h2>
            <p className="mb-4">We use the information we collect to:</p>
            <ul className="list-disc list-inside mb-6 space-y-2 pl-4">
              <li>Facilitate escrow payments and settlement between AI agents</li>
              <li>Display registered agents on the marketplace</li>
              <li>Monitor and prevent fraudulent or unauthorized transactions</li>
              <li>Comply with anti-money laundering (AML) requirements</li>
              <li>Improve and maintain our website and protocol</li>
              <li>Communicate important updates about the service</li>
            </ul>

            <h2 className={legalHeading2}>3. Data Sharing</h2>
            <p className="mb-4">
              We do not sell your personal information. We may share data with:
            </p>
            <ul className="list-disc list-inside mb-6 space-y-2 pl-4">
              <li><strong>Blockchain networks:</strong> Transaction data is broadcast to the XLayer network</li>
              <li><strong>Compliance partners:</strong> For AML/KYC screening as required by law</li>
              <li><strong>Service providers:</strong> Infrastructure and hosting providers that help us operate</li>
              <li><strong>Legal authorities:</strong> When required by law or to protect our rights</li>
            </ul>

            <h2 className={legalHeading2}>4. Data Security</h2>
            <p className="mb-6">
              We implement industry-standard security measures to protect your information. However, no method of transmission over the Internet is 100% secure. We use encryption, access controls, and regular security audits to safeguard data.
            </p>

            <h2 className={legalHeading2}>5. Your Rights</h2>
            <p className="mb-4">Depending on your jurisdiction, you may have the right to:</p>
            <ul className="list-disc list-inside mb-6 space-y-2 pl-4">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data (excluding blockchain records)</li>
              <li>Opt out of marketing communications</li>
            </ul>

            <h2 className={legalHeading2}>6. Cookies</h2>
            <p className="mb-6">
              Our website uses minimal cookies for essential functionality. We do not use third-party tracking cookies. You can control cookie preferences through your browser settings.
            </p>

            <h2 className={legalHeading2}>7. Changes to This Policy</h2>
            <p className="mb-6">
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the &ldquo;Last updated&rdquo; date.
            </p>

            <h2 className={legalHeading2}>8. Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy, please contact us at{' '}
              <a href="mailto:privacy@xagenpay.com" className="text-primary hover:underline">privacy@xagenpay.com</a>.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

const TermsOfServicePage = ({ lang }: { lang: Language }) => {
  return (
    <section className="py-20 px-6">
      <div className="max-w-3xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/20 bg-primary/5 text-primary text-sm font-medium mb-6">
            <FileText className="w-4 h-4" />
            <span>Legal</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4 transition-colors">
            Terms of Service
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mb-12 transition-colors">
            Last updated: March 10, 2026
          </p>

          <div className={legalSectionClass}>
            <p className="mb-6">
              These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of the XAgent Pay website (xagenpay.com), protocol, and related services. By accessing or using our services, you agree to be bound by these Terms.
            </p>

            <h2 className={legalHeading2}>1. Acceptance of Terms</h2>
            <p className="mb-6">
              By using XAgent Pay, you confirm that you are at least 18 years old, have the legal capacity to enter into these Terms, and are not prohibited from using blockchain-based services under applicable laws.
            </p>

            <h2 className={legalHeading2}>2. Description of Service</h2>
            <p className="mb-4">
              XAgent Pay is a decentralized payment protocol that enables AI agents to make autonomous stablecoin payments on the XLayer blockchain. Our services include:
            </p>
            <ul className="list-disc list-inside mb-6 space-y-2 pl-4">
              <li>Escrow-based payment settlement between AI agents</li>
              <li>A marketplace for discovering and listing commercial AI agents</li>
              <li>MCP (Model Context Protocol) integration for agent-to-agent payments</li>
              <li>Automated revenue distribution and split payments</li>
            </ul>

            <h2 className={legalHeading2}>3. Wallet and Blockchain</h2>
            <p className="mb-6">
              You are solely responsible for the security of your wallet private keys. XAgent Pay is non-custodial — we never hold or have access to your funds. All transactions are executed through smart contracts on the XLayer blockchain and are irreversible once confirmed.
            </p>

            <h2 className={legalHeading2}>4. Agent Registration</h2>
            <p className="mb-4">When listing an AI agent on the XAgent Pay marketplace, you represent that:</p>
            <ul className="list-disc list-inside mb-6 space-y-2 pl-4">
              <li>You have the right to offer the agent&apos;s services</li>
              <li>Your agent does not facilitate illegal activities</li>
              <li>The information provided is accurate and up to date</li>
              <li>Your agent maintains reasonable uptime and service quality</li>
            </ul>

            <h2 className={legalHeading2}>5. Prohibited Uses</h2>
            <p className="mb-4">You agree not to use XAgent Pay to:</p>
            <ul className="list-disc list-inside mb-6 space-y-2 pl-4">
              <li>Facilitate money laundering, terrorist financing, or other illegal activities</li>
              <li>Circumvent sanctions or trade restrictions</li>
              <li>Engage in fraud, deception, or market manipulation</li>
              <li>Interfere with or disrupt the protocol or other users&apos; access</li>
              <li>Reverse-engineer or attempt to exploit smart contract vulnerabilities</li>
            </ul>

            <h2 className={legalHeading2}>6. Fees</h2>
            <p className="mb-6">
              XAgent Pay may charge protocol fees on transactions processed through the escrow contract. Fee rates are transparently defined in the smart contract and may be updated through governance. You are also responsible for blockchain gas fees on the XLayer network.
            </p>

            <h2 className={legalHeading2}>7. Disclaimer of Warranties</h2>
            <p className="mb-6">
              XAgent Pay is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind, either express or implied. We do not guarantee uninterrupted access, error-free operation, or that the protocol will meet your requirements. Smart contracts may contain bugs despite auditing efforts.
            </p>

            <h2 className={legalHeading2}>8. Limitation of Liability</h2>
            <p className="mb-6">
              To the maximum extent permitted by law, XAgent Pay and its contributors shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of funds, data, or business opportunities, arising from your use of or inability to use our services.
            </p>

            <h2 className={legalHeading2}>9. Indemnification</h2>
            <p className="mb-6">
              You agree to indemnify and hold harmless XAgent Pay, its contributors, and affiliates from any claims, damages, or expenses arising from your use of the service, violation of these Terms, or infringement of any third party&apos;s rights.
            </p>

            <h2 className={legalHeading2}>10. Modifications</h2>
            <p className="mb-6">
              We reserve the right to modify these Terms at any time. Changes will be effective upon posting to this page. Your continued use of XAgent Pay after changes constitutes acceptance of the updated Terms.
            </p>

            <h2 className={legalHeading2}>11. Governing Law</h2>
            <p className="mb-6">
              These Terms shall be governed by and construed in accordance with applicable laws, without regard to conflict of law principles. Any disputes shall be resolved through binding arbitration.
            </p>

            <h2 className={legalHeading2}>12. Contact</h2>
            <p>
              For questions about these Terms, please contact us at{' '}
              <a href="mailto:legal@xagenpay.com" className="text-primary hover:underline">legal@xagenpay.com</a>.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

// --- Main App ---

export default function App() {
  const [lang, setLang] = useState<Language>('en');
  const [page, setPage] = useState<PageType>('home');
  const [theme, setTheme] = useState<'dark' | 'light'>('light');

  // Scroll to top on page change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    if (theme === 'dark') {
      html.classList.add('dark');
      body.classList.add('dark');
    } else {
      html.classList.remove('dark');
      body.classList.remove('dark');
    }
  }, [theme]);

  return (
    <div className={`min-h-screen flex flex-col selection:bg-primary selection:text-white transition-colors duration-300 ${theme}`}>
      <Navbar lang={lang} setLang={setLang} page={page} setPage={setPage} theme={theme} setTheme={setTheme} />
      
      <main className="flex-1">
        <AnimatePresence mode="wait">
          {page === 'home' ? (
            <motion.div
              key="home"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Hero lang={lang} />
              <ApiKeysSection lang={lang} />
              <RevenueDistribution lang={lang} />
              <Compliance lang={lang} />
              <Monetize lang={lang} />
              <UseCases lang={lang} />
            </motion.div>
          ) : page === 'market' ? (
            <motion.div
              key="market"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <MarketPage lang={lang} />
            </motion.div>
          ) : page === 'privacy' ? (
            <motion.div
              key="privacy"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <PrivacyPolicyPage lang={lang} />
            </motion.div>
          ) : (
            <motion.div
              key="terms"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <TermsOfServicePage lang={lang} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <Footer lang={lang} setPage={setPage} />
    </div>
  );
}
