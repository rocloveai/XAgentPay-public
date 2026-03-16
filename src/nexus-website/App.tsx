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

const Hero = ({ lang, setPage }: { lang: Language; setPage: (p: PageType) => void }) => {
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
            <button onClick={() => setPage('market')} className="bg-primary text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-primary/90 transition-all flex items-center gap-2 group">
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
              <a href="https://x.com/xagentpay" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-primary transition-colors">Twitter</a>
              <a href="https://discord.gg/xagentpay" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-primary transition-colors">Discord</a>
              <a href="https://github.com/rocloveai/XAgentPay" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-primary transition-colors">GitHub</a>
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
            <a href="https://xagenpay.com" className="text-slate-400 dark:text-slate-600 hover:text-primary transition-colors"><Globe className="w-4 h-4" /></a>
            <a href="https://xlayer.tech" target="_blank" rel="noopener noreferrer" className="text-slate-400 dark:text-slate-600 hover:text-primary transition-colors"><Shield className="w-4 h-4" /></a>
            <a href="https://github.com/rocloveai/XAgentPay" target="_blank" rel="noopener noreferrer" className="text-slate-400 dark:text-slate-600 hover:text-primary transition-colors"><Lock className="w-4 h-4" /></a>
          </div>
        </div>
      </div>
    </footer>
  );
};

// --- Market Page ---

// --- API Configuration ---
const API_URL = import.meta.env.VITE_NEXUS_CORE_URL || "https://api.xagenpay.com";
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
  const [copiedDid, setCopiedDid] = useState<string | null>(null);

  // --- Registration form state ---
  const [formData, setFormData] = useState({
    skill_md_url: '', merchant_did: '', name: '', description: '',
    category: '', signer_address: '', payment_address: '', health_url: '',
    skill_user_url: '', webhook_url: '', webhook_secret: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    status: 'success' | 'error'; message: string; agent?: MarketAgent;
  } | null>(null);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [autoFillStatus, setAutoFillStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [showOptional, setShowOptional] = useState(false);

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors(prev => { const next = { ...prev }; delete next[field]; return next; });
    }
  };

  const tf = t.list.form as Record<string, any>;
  const validators: Record<string, (v: string) => string> = {
    skill_md_url: (v) => !v ? tf.errors.required : !/^https?:\/\/.+/.test(v) ? tf.errors.invalidUrl : '',
    merchant_did: (v) => !v ? tf.errors.required : !/^did:nexus:\d+:\w+$/.test(v) ? tf.errors.invalidDid : '',
    name: (v) => !v ? tf.errors.required : (v.length < 2 || v.length > 100) ? tf.errors.nameLength : '',
    description: (v) => !v ? tf.errors.required : (v.length < 10 || v.length > 500) ? tf.errors.descLength : '',
    category: (v) => !v ? tf.errors.required : '',
    signer_address: (v) => !v ? tf.errors.required : !/^0x[a-fA-F0-9]{40}$/.test(v) ? tf.errors.invalidAddress : '',
    payment_address: (v) => !v ? tf.errors.required : !/^0x[a-fA-F0-9]{40}$/.test(v) ? tf.errors.invalidAddress : '',
    health_url: (v) => !v ? tf.errors.required : !/^https?:\/\/.+/.test(v) ? tf.errors.invalidUrl : '',
    skill_user_url: (v) => v && !/^https?:\/\/.+/.test(v) ? tf.errors.invalidUrl : '',
    webhook_url: (v) => v && !/^https?:\/\/.+/.test(v) ? tf.errors.invalidUrl : '',
    webhook_secret: () => '',
  };

  const validateField = (field: string) => {
    const val = formData[field as keyof typeof formData] || '';
    const err = validators[field]?.(val) || '';
    if (err) setFormErrors(prev => ({ ...prev, [field]: err }));
  };

  const handleAutoFill = async (url: string) => {
    if (!url || !/^https?:\/\/.+/.test(url)) return;
    setIsAutoFilling(true);
    setAutoFillStatus('loading');
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const fmMatch = text.match(/^---\s*\n([\s\S]*?)\n---/);
      if (!fmMatch) { setAutoFillStatus('error'); setIsAutoFilling(false); return; }
      const kvMap = new Map<string, string>();
      for (const line of fmMatch[1].split('\n')) {
        const m = line.match(/^(\w[\w_-]*):\s*(.+)$/);
        if (m) kvMap.set(m[1].trim(), m[2].trim().replace(/^["'](.*)["']$/, '$1'));
      }
      setFormData(prev => ({
        ...prev,
        merchant_did: prev.merchant_did || kvMap.get('merchant_did') || '',
        name: prev.name || kvMap.get('name') || '',
        description: prev.description || kvMap.get('description') || '',
        category: prev.category || kvMap.get('category')?.split('.')[0] || '',
      }));
      setAutoFillStatus('success');
    } catch {
      setAutoFillStatus('error');
    } finally {
      setIsAutoFilling(false);
    }
  };

  const handleRegisterSubmit = async () => {
    const errors: Record<string, string> = {};
    for (const field of ['skill_md_url','merchant_did','name','description','category','signer_address','payment_address','health_url']) {
      const err = validators[field](formData[field as keyof typeof formData]);
      if (err) errors[field] = err;
    }
    for (const field of ['skill_user_url','webhook_url']) {
      const val = formData[field as keyof typeof formData];
      if (val) { const err = validators[field](val); if (err) errors[field] = err; }
    }
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }

    setIsSubmitting(true);
    setSubmitResult(null);
    try {
      const payload: Record<string, string> = {};
      for (const [key, value] of Object.entries(formData)) { if (value) payload[key] = value; }
      const res = await fetch(`${API_URL}/api/market/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setSubmitResult({ status: 'success', message: tf.successMessage, agent: data.agent });
        if (data.agent) {
          setAgents(prev => {
            const exists = prev.some((a: MarketAgent) => a.merchant_did === data.agent.merchant_did);
            return exists ? prev.map((a: MarketAgent) => a.merchant_did === data.agent.merchant_did ? data.agent : a) : [data.agent, ...prev];
          });
        }
      } else {
        setSubmitResult({ status: 'error', message: data.error || tf.errorMessage });
      }
    } catch {
      setSubmitResult({ status: 'error', message: tf.networkError });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({ skill_md_url: '', merchant_did: '', name: '', description: '', category: '', signer_address: '', payment_address: '', health_url: '', skill_user_url: '', webhook_url: '', webhook_secret: '' });
    setFormErrors({});
    setSubmitResult(null);
    setAutoFillStatus('idle');
    setShowOptional(false);
  };

  const copySkillUrl = (did: string, url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedDid(did);
      setTimeout(() => setCopiedDid(null), 2000);
    });
  };

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

                        <div className="flex gap-2">
                          <a
                            href={agent.skill_user_url || agent.skill_md_url || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 py-3 rounded-xl border border-primary/20 text-primary font-bold text-sm hover:bg-primary hover:text-white transition-all text-center block"
                          >
                            {t.discover.card.viewSkill}
                          </a>
                          {(agent.skill_user_url || agent.skill_md_url) && (
                            <button
                              onClick={() => copySkillUrl(agent.merchant_did, (agent.skill_user_url || agent.skill_md_url)!)}
                              className={`px-4 py-3 rounded-xl border font-bold text-sm transition-all flex items-center gap-1.5 ${
                                copiedDid === agent.merchant_did
                                  ? 'bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400'
                                  : 'border-primary/20 text-primary hover:bg-primary/10'
                              }`}
                              title="Copy Skill URL"
                            >
                              {copiedDid === agent.merchant_did ? (
                                <><CheckCircle2 className="w-4 h-4" /> Copied</>
                              ) : (
                                <><Copy className="w-4 h-4" /> Copy</>
                              )}
                            </button>
                          )}
                        </div>
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
                  <div className="sticky top-32 p-8 rounded-3xl bg-primary/5 border border-primary/10 flex flex-col gap-6 max-h-[calc(100vh-10rem)] overflow-y-auto">
                    {submitResult?.status === 'success' ? (
                      <div className="flex flex-col gap-6">
                        <div className="flex items-center gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/20">
                          <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0" />
                          <div>
                            <p className="font-bold text-green-600 dark:text-green-400">{tf.successTitle}</p>
                            <p className="text-sm text-green-600/80 dark:text-green-400/80">{tf.successMessage}</p>
                          </div>
                        </div>
                        {submitResult.agent && (
                          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-black/5 dark:border-white/5 flex flex-col gap-3">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${healthColor(submitResult.agent.health_status)}`} />
                              <h4 className="font-bold text-slate-900 dark:text-white">{submitResult.agent.name}</h4>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-400">{submitResult.agent.description}</p>
                            <span className="px-2 py-0.5 rounded bg-primary/10 text-[10px] font-mono text-primary border border-primary/20 w-fit">{submitResult.agent.category}</span>
                          </div>
                        )}
                        <button onClick={resetForm} className="w-full py-3 rounded-xl border border-primary/20 text-primary font-bold hover:bg-primary/10 transition-all">{tf.registerAnother}</button>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-col gap-2">
                          <h3 className="text-2xl font-bold text-slate-900 dark:text-white transition-colors">{tf.heading}</h3>
                          <p className="text-sm text-slate-600 dark:text-slate-400 transition-colors">{tf.subheading}</p>
                        </div>

                        {submitResult?.status === 'error' && (
                          <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                            <X className="w-5 h-5 text-red-500 flex-shrink-0" />
                            <p className="text-sm text-red-600 dark:text-red-400">{submitResult.message}</p>
                          </div>
                        )}

                        {/* Section 1: Auto-fill from skill.md */}
                        <div className="space-y-3">
                          <p className="text-[10px] font-bold text-primary uppercase tracking-widest">{tf.sectionAutoFill}</p>
                          <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase transition-colors">{tf.skillMdUrl} *</label>
                            <div className="flex gap-2">
                              <input type="text" placeholder={tf.placeholders.skillMdUrl} value={formData.skill_md_url} onChange={(e) => updateField('skill_md_url', e.target.value)} onBlur={() => validateField('skill_md_url')} className={`flex-1 bg-white dark:bg-slate-900 border ${formErrors.skill_md_url ? 'border-red-500/50' : 'border-black/10 dark:border-white/10'} rounded-xl p-3 focus:outline-none focus:border-primary transition-all text-slate-900 dark:text-white text-sm`} />
                              <button onClick={() => handleAutoFill(formData.skill_md_url)} disabled={isAutoFilling || !formData.skill_md_url} className="px-3 py-3 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-bold hover:bg-primary/20 transition-all disabled:opacity-50" title={tf.autoFillBtn}>
                                {isAutoFilling ? <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <Sparkles className="w-4 h-4" />}
                              </button>
                            </div>
                            {formErrors.skill_md_url && <p className="text-xs text-red-500">{formErrors.skill_md_url}</p>}
                            {autoFillStatus === 'success' && <p className="text-xs text-green-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{tf.autoFillSuccess}</p>}
                            {autoFillStatus === 'error' && <p className="text-xs text-amber-500">{tf.autoFillError}</p>}
                          </div>
                        </div>

                        {/* Section 2: Agent Identity */}
                        <div className="space-y-3">
                          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{tf.sectionIdentity}</p>
                          <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase transition-colors">{tf.merchantDid} *</label>
                            <input type="text" placeholder={tf.placeholders.merchantDid} value={formData.merchant_did} onChange={(e) => updateField('merchant_did', e.target.value)} onBlur={() => validateField('merchant_did')} className={`bg-white dark:bg-slate-900 border ${formErrors.merchant_did ? 'border-red-500/50' : 'border-black/10 dark:border-white/10'} rounded-xl p-3 focus:outline-none focus:border-primary transition-all text-slate-900 dark:text-white text-sm`} />
                            {formErrors.merchant_did && <p className="text-xs text-red-500">{formErrors.merchant_did}</p>}
                          </div>
                          <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase transition-colors">{tf.name} *</label>
                            <input type="text" placeholder={tf.placeholders.name} value={formData.name} onChange={(e) => updateField('name', e.target.value)} onBlur={() => validateField('name')} className={`bg-white dark:bg-slate-900 border ${formErrors.name ? 'border-red-500/50' : 'border-black/10 dark:border-white/10'} rounded-xl p-3 focus:outline-none focus:border-primary transition-all text-slate-900 dark:text-white text-sm`} />
                            {formErrors.name && <p className="text-xs text-red-500">{formErrors.name}</p>}
                          </div>
                          <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase transition-colors">{tf.description} *</label>
                            <textarea rows={3} placeholder={tf.placeholders.description} value={formData.description} onChange={(e) => updateField('description', e.target.value)} onBlur={() => validateField('description')} className={`bg-white dark:bg-slate-900 border ${formErrors.description ? 'border-red-500/50' : 'border-black/10 dark:border-white/10'} rounded-xl p-3 focus:outline-none focus:border-primary transition-all text-slate-900 dark:text-white text-sm resize-none`} />
                            {formErrors.description && <p className="text-xs text-red-500">{formErrors.description}</p>}
                          </div>
                          <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase transition-colors">{tf.category} *</label>
                            <select value={formData.category} onChange={(e) => updateField('category', e.target.value)} onBlur={() => validateField('category')} className={`bg-white dark:bg-slate-900 border ${formErrors.category ? 'border-red-500/50' : 'border-black/10 dark:border-white/10'} rounded-xl p-3 focus:outline-none focus:border-primary transition-all text-slate-900 dark:text-white text-sm`}>
                              <option value="">{tf.selectCategory}</option>
                              <option value="travel">Travel</option>
                              <option value="food">Food</option>
                              <option value="retail">Retail</option>
                              <option value="entertainment">Entertainment</option>
                              <option value="finance">Finance</option>
                              <option value="telecom">Telecom</option>
                              <option value="services">Services</option>
                            </select>
                            {formErrors.category && <p className="text-xs text-red-500">{formErrors.category}</p>}
                          </div>
                        </div>

                        {/* Section 3: Blockchain & Endpoints */}
                        <div className="space-y-3">
                          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{tf.sectionBlockchain}</p>
                          <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase transition-colors">{tf.signerAddress} *</label>
                            <input type="text" placeholder={tf.placeholders.signerAddress} value={formData.signer_address} onChange={(e) => updateField('signer_address', e.target.value)} onBlur={() => validateField('signer_address')} className={`bg-white dark:bg-slate-900 border ${formErrors.signer_address ? 'border-red-500/50' : 'border-black/10 dark:border-white/10'} rounded-xl p-3 focus:outline-none focus:border-primary transition-all text-slate-900 dark:text-white text-sm font-mono`} />
                            {formErrors.signer_address && <p className="text-xs text-red-500">{formErrors.signer_address}</p>}
                          </div>
                          <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase transition-colors">{tf.paymentAddress} *</label>
                            <input type="text" placeholder={tf.placeholders.paymentAddress} value={formData.payment_address} onChange={(e) => updateField('payment_address', e.target.value)} onBlur={() => validateField('payment_address')} className={`bg-white dark:bg-slate-900 border ${formErrors.payment_address ? 'border-red-500/50' : 'border-black/10 dark:border-white/10'} rounded-xl p-3 focus:outline-none focus:border-primary transition-all text-slate-900 dark:text-white text-sm font-mono`} />
                            {formErrors.payment_address && <p className="text-xs text-red-500">{formErrors.payment_address}</p>}
                          </div>
                          <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase transition-colors">{tf.healthUrl} *</label>
                            <input type="text" placeholder={tf.placeholders.healthUrl} value={formData.health_url} onChange={(e) => updateField('health_url', e.target.value)} onBlur={() => validateField('health_url')} className={`bg-white dark:bg-slate-900 border ${formErrors.health_url ? 'border-red-500/50' : 'border-black/10 dark:border-white/10'} rounded-xl p-3 focus:outline-none focus:border-primary transition-all text-slate-900 dark:text-white text-sm`} />
                            {formErrors.health_url && <p className="text-xs text-red-500">{formErrors.health_url}</p>}
                          </div>
                        </div>

                        {/* Section 4: Optional (collapsible) */}
                        <button type="button" onClick={() => setShowOptional(!showOptional)} className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-primary transition-colors">
                          <ChevronRight className={`w-4 h-4 transition-transform ${showOptional ? 'rotate-90' : ''}`} />
                          {showOptional ? tf.hideOptional : tf.showOptional}
                        </button>
                        {showOptional && (
                          <div className="space-y-3">
                            <div className="flex flex-col gap-2">
                              <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase transition-colors">{tf.skillUserUrl}</label>
                              <input type="text" placeholder={tf.placeholders.skillUserUrl} value={formData.skill_user_url} onChange={(e) => updateField('skill_user_url', e.target.value)} onBlur={() => validateField('skill_user_url')} className={`bg-white dark:bg-slate-900 border ${formErrors.skill_user_url ? 'border-red-500/50' : 'border-black/10 dark:border-white/10'} rounded-xl p-3 focus:outline-none focus:border-primary transition-all text-slate-900 dark:text-white text-sm`} />
                              {formErrors.skill_user_url && <p className="text-xs text-red-500">{formErrors.skill_user_url}</p>}
                            </div>
                            <div className="flex flex-col gap-2">
                              <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase transition-colors">{tf.webhookUrl}</label>
                              <input type="text" placeholder={tf.placeholders.webhookUrl} value={formData.webhook_url} onChange={(e) => updateField('webhook_url', e.target.value)} onBlur={() => validateField('webhook_url')} className={`bg-white dark:bg-slate-900 border ${formErrors.webhook_url ? 'border-red-500/50' : 'border-black/10 dark:border-white/10'} rounded-xl p-3 focus:outline-none focus:border-primary transition-all text-slate-900 dark:text-white text-sm`} />
                              {formErrors.webhook_url && <p className="text-xs text-red-500">{formErrors.webhook_url}</p>}
                            </div>
                            <div className="flex flex-col gap-2">
                              <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase transition-colors">{tf.webhookSecret}</label>
                              <input type="text" placeholder={tf.placeholders.webhookSecret} value={formData.webhook_secret} onChange={(e) => updateField('webhook_secret', e.target.value)} className="bg-white dark:bg-slate-900 border border-black/10 dark:border-white/10 rounded-xl p-3 focus:outline-none focus:border-primary transition-all text-slate-900 dark:text-white text-sm" />
                            </div>
                          </div>
                        )}

                        {/* Submit */}
                        <button onClick={handleRegisterSubmit} disabled={isSubmitting} className="w-full bg-primary text-white py-4 rounded-xl font-bold hover:bg-primary/90 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
                          {isSubmitting ? tf.submitting : tf.submit}
                        </button>
                        <div className="flex items-center gap-2 justify-center text-slate-500">
                          <Info className="w-4 h-4" />
                          <span className="text-xs">{tf.reviewNote}</span>
                        </div>
                      </>
                    )}
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
  const t = translations[lang].privacy;
  return (
    <section className="py-20 px-6">
      <div className="max-w-3xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/20 bg-primary/5 text-primary text-sm font-medium mb-6">
            <Shield className="w-4 h-4" />
            <span>{t.badge}</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4 transition-colors">
            {t.title}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mb-12 transition-colors">
            {t.lastUpdated}
          </p>

          <div className={legalSectionClass}>
            <p className="mb-6">{t.intro}</p>

            <h2 className={legalHeading2}>{t.infoCollect.title}</h2>
            <h3 className={legalHeading3}>{t.infoCollect.blockchain.title}</h3>
            <p className="mb-4">{t.infoCollect.blockchain.text}</p>
            <h3 className={legalHeading3}>{t.infoCollect.agentReg.title}</h3>
            <p className="mb-4">{t.infoCollect.agentReg.text}</p>
            <h3 className={legalHeading3}>{t.infoCollect.autoCollect.title}</h3>
            <p className="mb-4">{t.infoCollect.autoCollect.text}</p>

            <h2 className={legalHeading2}>{t.howWeUse.title}</h2>
            <p className="mb-4">{t.howWeUse.intro}</p>
            <ul className="list-disc list-inside mb-6 space-y-2 pl-4">
              {t.howWeUse.items.map((item: string, i: number) => <li key={i}>{item}</li>)}
            </ul>

            <h2 className={legalHeading2}>{t.dataSharing.title}</h2>
            <p className="mb-4">{t.dataSharing.intro}</p>
            <ul className="list-disc list-inside mb-6 space-y-2 pl-4">
              {t.dataSharing.items.map((item: { bold: string; text: string }, i: number) => (
                <li key={i}><strong>{item.bold}</strong> {item.text}</li>
              ))}
            </ul>

            <h2 className={legalHeading2}>{t.dataSecurity.title}</h2>
            <p className="mb-6">{t.dataSecurity.text}</p>

            <h2 className={legalHeading2}>{t.yourRights.title}</h2>
            <p className="mb-4">{t.yourRights.intro}</p>
            <ul className="list-disc list-inside mb-6 space-y-2 pl-4">
              {t.yourRights.items.map((item: string, i: number) => <li key={i}>{item}</li>)}
            </ul>

            <h2 className={legalHeading2}>{t.cookies.title}</h2>
            <p className="mb-6">{t.cookies.text}</p>

            <h2 className={legalHeading2}>{t.changes.title}</h2>
            <p className="mb-6">{t.changes.text}</p>

            <h2 className={legalHeading2}>{t.contact.title}</h2>
            <p>
              {t.contact.text}{' '}
              <a href={`mailto:${t.contact.email}`} className="text-primary hover:underline">{t.contact.email}</a>.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

const TermsOfServicePage = ({ lang }: { lang: Language }) => {
  const t = translations[lang].terms;
  return (
    <section className="py-20 px-6">
      <div className="max-w-3xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/20 bg-primary/5 text-primary text-sm font-medium mb-6">
            <FileText className="w-4 h-4" />
            <span>{t.badge}</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4 transition-colors">
            {t.title}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mb-12 transition-colors">
            {t.lastUpdated}
          </p>

          <div className={legalSectionClass}>
            <p className="mb-6">{t.intro}</p>

            <h2 className={legalHeading2}>{t.acceptance.title}</h2>
            <p className="mb-6">{t.acceptance.text}</p>

            <h2 className={legalHeading2}>{t.description.title}</h2>
            <p className="mb-4">{t.description.intro}</p>
            <ul className="list-disc list-inside mb-6 space-y-2 pl-4">
              {t.description.items.map((item: string, i: number) => <li key={i}>{item}</li>)}
            </ul>

            <h2 className={legalHeading2}>{t.wallet.title}</h2>
            <p className="mb-6">{t.wallet.text}</p>

            <h2 className={legalHeading2}>{t.agentReg.title}</h2>
            <p className="mb-4">{t.agentReg.intro}</p>
            <ul className="list-disc list-inside mb-6 space-y-2 pl-4">
              {t.agentReg.items.map((item: string, i: number) => <li key={i}>{item}</li>)}
            </ul>

            <h2 className={legalHeading2}>{t.prohibited.title}</h2>
            <p className="mb-4">{t.prohibited.intro}</p>
            <ul className="list-disc list-inside mb-6 space-y-2 pl-4">
              {t.prohibited.items.map((item: string, i: number) => <li key={i}>{item}</li>)}
            </ul>

            <h2 className={legalHeading2}>{t.fees.title}</h2>
            <p className="mb-6">{t.fees.text}</p>

            <h2 className={legalHeading2}>{t.disclaimer.title}</h2>
            <p className="mb-6">{t.disclaimer.text}</p>

            <h2 className={legalHeading2}>{t.liability.title}</h2>
            <p className="mb-6">{t.liability.text}</p>

            <h2 className={legalHeading2}>{t.indemnification.title}</h2>
            <p className="mb-6">{t.indemnification.text}</p>

            <h2 className={legalHeading2}>{t.modifications.title}</h2>
            <p className="mb-6">{t.modifications.text}</p>

            <h2 className={legalHeading2}>{t.governing.title}</h2>
            <p className="mb-6">{t.governing.text}</p>

            <h2 className={legalHeading2}>{t.contact.title}</h2>
            <p>
              {t.contact.text}{' '}
              <a href={`mailto:${t.contact.email}`} className="text-primary hover:underline">{t.contact.email}</a>.
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
  // Read initial page from URL hash
  const getPageFromHash = (): PageType => {
    const hash = window.location.hash.replace('#', '');
    if (['home', 'market', 'privacy', 'terms'].includes(hash)) return hash as PageType;
    return 'home';
  };

  const [page, setPageState] = useState<PageType>(getPageFromHash);
  const [theme, setTheme] = useState<'dark' | 'light'>('light');

  // Sync page state with URL hash
  const setPage = (p: PageType) => {
    window.location.hash = p === 'home' ? '' : p;
    setPageState(p);
  };

  // Listen for browser back/forward navigation
  useEffect(() => {
    const onHashChange = () => setPageState(getPageFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

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
              <Hero lang={lang} setPage={setPage} />
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
