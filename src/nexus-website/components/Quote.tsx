import React from 'react';

const Quote: React.FC = () => {
  return (
    <section className="py-16 sm:py-24 relative overflow-hidden">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
        
        <span className="material-icons-round text-6xl text-white/10 absolute -top-4 left-1/2 -translate-x-1/2 scale-150 select-none">format_quote</span>
        
        <blockquote className="relative">
          <p className="text-2xl sm:text-4xl md:text-5xl font-display font-medium text-white leading-tight mb-8">
            "AI agents will become the largest economic workforce in history. They need a native settlement layer, not a human billing system."
          </p>
          <footer className="flex flex-col items-center gap-2">
            <div className="w-12 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent mb-2"></div>
            <cite className="not-italic text-lg font-bold text-white tracking-wide">Nexus Protocol</cite>
            <span className="text-sm text-gray-500 uppercase tracking-widest font-mono">Vision Statement</span>
          </footer>
        </blockquote>

      </div>
    </section>
  );
};

export default Quote;