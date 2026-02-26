import React from "react";
import { useTranslation } from "react-i18next";

const Standards: React.FC = () => {
  const { t } = useTranslation();

  return (
    <section id="protocol" className="py-16 sm:py-20 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 sm:mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            {t("standards.title")}
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto text-sm sm:text-base">
            {t("standards.subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {/* Card 1 - The Problem */}
          <div className="glass-card p-6 sm:p-8 rounded-xl group relative overflow-hidden border-white/5 hover:border-red-500/30">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="material-icons-round text-6xl sm:text-8xl text-red-500">
                running_with_errors
              </span>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-red-500/10 flex items-center justify-center mb-4 sm:mb-6 text-red-500">
              <span className="material-icons-round text-xl sm:text-2xl">
                credit_card_off
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-white mb-2 sm:mb-3">
              {t("standards.oldWay")}
            </h3>
            <p className="text-xs sm:text-sm text-red-400 mb-2 font-mono">
              {t("standards.oldWayLabel")}
            </p>
            <p className="text-gray-400 leading-relaxed text-xs sm:text-sm">
              {t("standards.oldWayDesc")}
            </p>
          </div>

          {/* Card 2 - The Solution (HTTP 402) */}
          <div className="glass-card p-6 sm:p-8 rounded-xl group relative overflow-hidden border-accent-cyan/30 bg-accent-cyan/5">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="material-icons-round text-6xl sm:text-8xl text-accent-cyan">
                http
              </span>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-accent-cyan/20 flex items-center justify-center mb-4 sm:mb-6 text-accent-cyan group-hover:scale-110 transition-transform">
              <span className="material-icons-round text-xl sm:text-2xl">
                bolt
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-white mb-2 sm:mb-3">
              {t("standards.http402")}
            </h3>
            <p className="text-xs sm:text-sm text-accent-cyan mb-2 font-mono">
              {t("standards.http402Label")}
            </p>
            <p className="text-gray-400 leading-relaxed text-xs sm:text-sm">
              {t("standards.http402Desc")}
            </p>
          </div>

          {/* Card 3 - The Tech (AP2) */}
          <div className="glass-card p-6 sm:p-8 rounded-xl group relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="material-icons-round text-6xl sm:text-8xl text-primary">
                fingerprint
              </span>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-primary/20 flex items-center justify-center mb-4 sm:mb-6 text-primary group-hover:scale-110 transition-transform">
              <span className="material-icons-round text-xl sm:text-2xl">
                verified_user
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-white mb-2 sm:mb-3">
              {t("standards.identity")}
            </h3>
            <p className="text-xs sm:text-sm text-primary mb-2 font-mono">
              {t("standards.identityLabel")}
            </p>
            <p className="text-gray-400 leading-relaxed text-xs sm:text-sm">
              {t("standards.identityDesc")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Standards;
