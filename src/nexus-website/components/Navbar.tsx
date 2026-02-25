import React from "react";

const Navbar: React.FC = () => {
  return (
    <nav className="fixed top-0 w-full z-50 glass-panel border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-primary to-accent-cyan flex items-center justify-center shadow-lg shadow-primary/20">
              <span className="material-icons-round text-white text-sm">
                hub
              </span>
            </div>
            <span className="text-2xl font-bold tracking-wider text-white">
              NEXUS
            </span>
            <div className="h-6 w-[1px] bg-white/20 mx-2 hidden sm:block"></div>
            <div className="hidden sm:flex items-center gap-2 opacity-80 hover:opacity-100 transition-opacity">
              <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">
                BASED ON
              </span>
              <span className="text-sm font-bold text-white tracking-widest font-display">
                PLATON
              </span>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-6">
            <a
              href="#marketplace"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Market
            </a>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
