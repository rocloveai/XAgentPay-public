import React from "react";
import { useTranslation } from "react-i18next";

const Footer: React.FC = () => {
  const { t } = useTranslation();

  return (
    <footer
      className="border-t border-white/5 bg-background-dark relative pt-12 sm:pt-20 pb-10"
      id="docs"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between gap-8 md:gap-12 mb-12 sm:mb-16">
          {/* Brand */}
          <div className="max-w-xs">
            <div className="flex items-center gap-2 mb-4">
              <img
                src="/logo.png"
                alt="XAgent Pay"
                className="w-6 h-6 object-contain invert"
              />
              <span className="text-xl font-bold text-white">XAgent Pay</span>
            </div>
            <p className="text-gray-500 text-sm mb-4">{t("footer.tagline")}</p>
            <div className="flex items-center gap-2 opacity-60">
              <span className="text-xs text-gray-500 font-mono uppercase tracking-widest">
                {t("navbar.basedOn")}
              </span>
              <span className="text-sm font-bold text-white tracking-widest font-display">
                XLAYER
              </span>
            </div>
          </div>

          <div>
            <h4 className="text-white font-bold mb-4">
              {t("footer.community")}
            </h4>
            <div className="flex gap-4">
              {["discord", "alternate_email", "forum"].map((icon) => (
                <a
                  key={icon}
                  href="#"
                  className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center hover:bg-primary transition-colors text-white"
                >
                  <span className="material-icons-round">{icon}</span>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-center md:text-left">
          <p className="text-gray-600 text-xs sm:text-sm">
            {t("footer.copyright")}
          </p>
          <div className="flex gap-6 text-xs sm:text-sm text-gray-600">
            <a href="#" className="hover:text-gray-400">
              {t("footer.privacy")}
            </a>
            <a href="#" className="hover:text-gray-400">
              {t("footer.terms")}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
