import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="border-t border-white/5 bg-background-dark relative pt-12 sm:pt-20 pb-10" id="docs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between gap-8 md:gap-12 mb-12 sm:mb-16">
          
          {/* Brand */}
          <div className="max-w-xs">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
                <span className="material-icons-round text-white text-[10px]">hub</span>
              </div>
              <span className="text-xl font-bold text-white">NEXUS</span>
            </div>
            <p className="text-gray-500 text-sm mb-4">
              Powering the economy of tomorrow's autonomous intelligence.
            </p>
            <div className="flex items-center gap-2 opacity-60">
              <span className="text-xs text-gray-500 font-mono uppercase tracking-widest">BASED ON</span>
              <span className="text-sm font-bold text-white tracking-widest font-display">PLATON</span>
            </div>
          </div>

          <div>
            <h4 className="text-white font-bold mb-4">Community</h4>
            <div className="flex gap-4">
              {['discord', 'alternate_email', 'forum'].map(icon => (
                <a key={icon} href="#" className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center hover:bg-primary transition-colors text-white">
                  <span className="material-icons-round">{icon}</span>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-center md:text-left">
          <p className="text-gray-600 text-xs sm:text-sm">© 2023 Nexus Protocol Foundation. All rights reserved.</p>
          <div className="flex gap-6 text-xs sm:text-sm text-gray-600">
            <a href="#" className="hover:text-gray-400">Privacy Policy</a>
            <a href="#" className="hover:text-gray-400">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;