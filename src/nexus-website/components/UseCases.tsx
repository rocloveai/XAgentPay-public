import React from "react";
import { useTranslation } from "react-i18next";

const UseCases: React.FC = () => {
  const { t } = useTranslation();

  const cases = [
    {
      titleKey: "useCases.travel",
      icon: "flight_takeoff",
      color: "text-blue-400",
      descKey: "useCases.travelDesc",
    },
    {
      titleKey: "useCases.data",
      icon: "insights",
      color: "text-purple-400",
      descKey: "useCases.dataDesc",
    },
    {
      titleKey: "useCases.compute",
      icon: "memory",
      color: "text-cyan-400",
      descKey: "useCases.computeDesc",
    },
  ];

  return (
    <section className="py-20 sm:py-28 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <div>
            <span className="text-primary font-mono text-xs uppercase tracking-widest mb-2 block">
              {t("useCases.label")}
            </span>
            <h2 className="text-3xl md:text-5xl font-bold text-white">
              {t("useCases.title")}
            </h2>
          </div>
          <p className="text-gray-400 max-w-md text-sm md:text-right">
            {t("useCases.subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cases.map((item, idx) => (
            <div
              key={idx}
              className="glass-card p-6 sm:p-8 rounded-2xl group hover:bg-white/5 transition-all"
            >
              <div
                className={`w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center mb-6 border border-white/10 group-hover:scale-110 transition-transform ${item.color}`}
              >
                <span className="material-icons-round text-2xl">
                  {item.icon}
                </span>
              </div>
              <h3 className="text-xl font-bold text-white mb-3">
                {t(item.titleKey)}
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                {t(item.descKey)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default UseCases;
