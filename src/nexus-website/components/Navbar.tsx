import React, { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher";

interface NavbarProps {
  readonly currentPage: "home" | "market";
}

const Navbar: React.FC<NavbarProps> = ({ currentPage }) => {
  const { t } = useTranslation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleMenu = useCallback(() => {
    setMobileMenuOpen((prev) => !prev);
  }, []);

  const closeMenu = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  return (
    <nav className="fixed top-0 w-full z-50 glass-panel border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <div className="flex items-center gap-2">
            <a href="#/" className="flex items-center gap-2 cursor-pointer">
              <div className="w-8 h-8 rounded bg-gradient-to-br from-primary to-accent-cyan flex items-center justify-center shadow-lg shadow-primary/20">
                <span className="material-icons-round text-white text-sm">
                  hub
                </span>
              </div>
              <span className="text-2xl font-bold tracking-wider text-white">
                NEXUS
              </span>
            </a>
            <div className="h-6 w-[1px] bg-white/20 mx-2 hidden sm:block"></div>
            <div className="hidden sm:flex items-center gap-2 opacity-80 hover:opacity-100 transition-opacity">
              <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">
                {t("navbar.basedOn")}
              </span>
              <span className="text-sm font-bold text-white tracking-widest font-display">
                PLATON
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 sm:gap-6">
            {/* Desktop nav */}
            <div className="hidden sm:flex items-center gap-6">
              <a
                href="#/"
                className={`text-sm transition-colors ${
                  currentPage === "home"
                    ? "text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {t("navbar.home")}
              </a>
              <a
                href="#/market"
                className={`text-sm transition-colors ${
                  currentPage === "market"
                    ? "text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {t("navbar.market")}
              </a>
            </div>
            <LanguageSwitcher />
            {/* Mobile hamburger */}
            <button
              type="button"
              className="sm:hidden flex items-center justify-center w-9 h-9 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              onClick={toggleMenu}
              aria-label="Toggle menu"
            >
              <span className="material-icons-round text-xl">
                {mobileMenuOpen ? "close" : "menu"}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-t border-white/5 bg-black/80 backdrop-blur-xl">
          <div className="px-4 py-3 flex flex-col gap-1">
            <a
              href="#/"
              onClick={closeMenu}
              className={`px-3 py-2.5 rounded-lg text-sm transition-colors ${
                currentPage === "home"
                  ? "text-white bg-white/10"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {t("navbar.home")}
            </a>
            <a
              href="#/market"
              onClick={closeMenu}
              className={`px-3 py-2.5 rounded-lg text-sm transition-colors ${
                currentPage === "market"
                  ? "text-white bg-white/10"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {t("navbar.market")}
            </a>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
