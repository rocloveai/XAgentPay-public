import React from "react";
import { useTranslation } from "react-i18next";

const SKILL_URL = "https://nexus-mvp.topos.one/skill.md";

const Developers: React.FC = () => {
  const { t } = useTranslation();

  return (
    <section id="integration" className="py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12 sm:mb-16">
          <span className="text-accent-cyan uppercase tracking-widest text-xs sm:text-sm font-bold">
            {t("developers.label")}
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-white mt-2">
            {t("developers.title")}
          </h2>
          <p className="text-gray-400 mt-4 max-w-2xl mx-auto text-sm sm:text-base">
            {t("developers.subtitle")}
          </p>
        </div>

        {/* 3 Step Process */}
        <div className="relative mt-8 sm:mt-12 mb-16 sm:mb-20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 sm:gap-8 relative z-10">
            {/* Step 1 */}
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl glass-panel flex items-center justify-center mb-4 sm:mb-6 relative group border-primary/30 bg-background-dark">
                <div className="absolute inset-0 bg-primary/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <span className="material-icons-round text-4xl sm:text-5xl text-white">
                  link
                </span>
                <div className="absolute -bottom-3 px-3 py-1 bg-background-dark border border-white/10 rounded-full text-[10px] sm:text-xs text-gray-300 shadow-md">
                  {t("developers.step1Badge")}
                </div>
              </div>
              <h4 className="text-lg sm:text-xl font-bold text-white">
                {t("developers.step1Title")}
              </h4>
              <p className="text-gray-400 text-xs sm:text-sm mt-2 px-4">
                {t("developers.step1Desc")}
              </p>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col items-center text-center">
              <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full border-2 border-primary/50 bg-background-dark flex items-center justify-center mb-4 sm:mb-6 relative neon-border shadow-[0_0_30px_rgba(37,106,244,0.3)] z-10">
                <span className="material-icons-round text-5xl sm:text-6xl text-transparent bg-clip-text bg-gradient-to-br from-white to-primary">
                  smart_toy
                </span>
              </div>
              <h4 className="text-lg sm:text-xl font-bold text-white">
                {t("developers.step2Title")}
              </h4>
              <p className="text-gray-400 text-xs sm:text-sm mt-2 px-4">
                {t("developers.step2Desc")}
              </p>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl glass-panel flex items-center justify-center mb-4 sm:mb-6 relative group border-accent-purple/30 bg-background-dark">
                <div className="absolute inset-0 bg-accent-purple/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <span className="material-icons-round text-4xl sm:text-5xl text-white">
                  payments
                </span>
                <div className="absolute -bottom-3 px-3 py-1 bg-background-dark border border-white/10 rounded-full text-[10px] sm:text-xs text-gray-300 shadow-md">
                  {t("developers.step3Badge")}
                </div>
              </div>
              <h4 className="text-lg sm:text-xl font-bold text-white">
                {t("developers.step3Title")}
              </h4>
              <p className="text-gray-400 text-xs sm:text-sm mt-2 px-4">
                {t("developers.step3Desc")}
              </p>
            </div>
          </div>
        </div>

        {/* AI chat demo */}
        <div className="mt-12 sm:mt-16 max-w-4xl mx-auto">
          <div className="rounded-xl overflow-hidden shadow-2xl bg-[#1a1a2e] border border-white/10 relative">
            {/* Window Controls & Title */}
            <div className="bg-[#1a1a2e] pt-3 px-4 flex items-center justify-between border-b border-white/5">
              <div className="flex items-center">
                <div className="flex gap-2 mr-6 mb-2">
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-[#ff5f56]"></div>
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-[#ffbd2e]"></div>
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-[#27c93f]"></div>
                </div>
                <div className="flex items-center gap-2 mb-2 text-[10px] sm:text-xs text-gray-400">
                  <span className="material-icons-round text-[12px] sm:text-[14px]">
                    terminal
                  </span>
                  <span className="font-medium text-gray-300">Claude Code</span>
                  <span className="text-gray-600">&mdash;</span>
                  <span>my-flight-agent/</span>
                </div>
              </div>
            </div>

            {/* Chat Content */}
            <div className="p-4 sm:p-6 space-y-5 text-[12px] sm:text-[13px] leading-relaxed">
              {/* User prompt */}
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="material-icons-round text-primary text-[14px]">
                    person
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-200">
                    {t("developers.demoPrompt")}{" "}
                    <span className="text-primary break-all">{SKILL_URL}</span>{" "}
                    {t("developers.demoPromptEnd")}{" "}
                    <span className="text-accent-cyan font-mono text-[11px]">
                      0x1a2B...9eF0
                    </span>
                  </p>
                </div>
              </div>

              {/* AI response — step by step */}
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-accent-purple/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="material-icons-round text-accent-purple text-[14px]">
                    smart_toy
                  </span>
                </div>
                <div className="flex-1 space-y-3 min-w-0">
                  <p className="text-gray-400">
                    {t("developers.demoResponse")}
                  </p>

                  {/* Step items */}
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="material-icons-round text-green-400 text-[16px] mt-0.5 flex-shrink-0">
                        check_circle
                      </span>
                      <span className="text-gray-300">
                        <span className="text-white font-medium">
                          {t("developers.demoReadSkill")}
                        </span>{" "}
                        {t("developers.demoReadSkillDetail")}
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="material-icons-round text-green-400 text-[16px] mt-0.5 flex-shrink-0">
                        check_circle
                      </span>
                      <span className="text-gray-300">
                        <span className="text-white font-medium">
                          {t("developers.demoRegistered")}
                        </span>{" "}
                        &mdash;{" "}
                        <code className="text-primary/70 bg-primary/5 px-1 rounded text-[11px]">
                          did:nexus:20250407:my_flight_agent
                        </code>
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="material-icons-round text-green-400 text-[16px] mt-0.5 flex-shrink-0">
                        check_circle
                      </span>
                      <span className="text-gray-300">
                        <span className="text-white font-medium">
                          {t("developers.demoLinked")}
                        </span>{" "}
                        &mdash;{" "}
                        <code className="text-accent-cyan/70 font-mono text-[11px]">
                          0x1a2B...9eF0
                        </code>
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="material-icons-round text-green-400 text-[16px] mt-0.5 flex-shrink-0">
                        check_circle
                      </span>
                      <span className="text-gray-300">
                        <span className="text-white font-medium">
                          {t("developers.demoAddedTools")}
                        </span>{" "}
                        &mdash;{" "}
                        <code className="text-primary/70 bg-primary/5 px-1 rounded text-[11px]">
                          nexus_generate_quote
                        </code>{" "}
                        +{" "}
                        <code className="text-primary/70 bg-primary/5 px-1 rounded text-[11px]">
                          nexus_check_status
                        </code>
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="material-icons-round text-green-400 text-[16px] mt-0.5 flex-shrink-0">
                        check_circle
                      </span>
                      <span className="text-gray-300">
                        <span className="text-white font-medium">
                          {t("developers.demoPublished")}
                        </span>{" "}
                        {t("developers.demoPublishedDetail")}
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="material-icons-round text-green-400 text-[16px] mt-0.5 flex-shrink-0">
                        check_circle
                      </span>
                      <span className="text-gray-300">
                        <span className="text-white font-medium">
                          {t("developers.demoHealth")}
                        </span>{" "}
                        &mdash;{" "}
                        <code className="text-green-400/70 bg-green-500/5 px-1 rounded text-[11px]">
                          /health
                        </code>{" "}
                        {t("developers.demoHealthDetail")}
                      </span>
                    </div>
                  </div>

                  {/* Summary box */}
                  <div className="rounded-lg bg-green-500/5 border border-green-500/15 p-3 mt-3">
                    <p className="text-green-400 text-[12px] font-medium">
                      {t("developers.demoSummary")}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Status Bar */}
            <div className="bg-[#3b82f6] text-white text-[10px] sm:text-[11px] py-1 px-4 flex justify-between items-center font-sans select-none">
              <div className="flex gap-4 sm:gap-6">
                <span className="font-semibold">main</span>
                <span>my-flight-agent/</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-[10px]">
                  check_circle
                </span>
                <span>{t("developers.demoStatusBar")}</span>
              </div>
            </div>
          </div>

          {/* Caption */}
          <p className="text-center text-xs text-gray-500 mt-4">
            {t("developers.caption")}
          </p>
        </div>
      </div>
    </section>
  );
};

export default Developers;
