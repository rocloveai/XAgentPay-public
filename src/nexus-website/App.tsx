import React, { useState, useEffect } from "react";
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import ProtocolFlow from "./components/ProtocolFlow";
import Standards from "./components/Standards";
import Infrastructure from "./components/Infrastructure";
import MarketplacePage from "./components/MarketplacePage";
import Developers from "./components/Developers";
import Footer from "./components/Footer";

type Page = "home" | "market";

function getPage(): Page {
  const hash = window.location.hash;
  if (hash === "#/market" || hash === "#/marketplace") return "market";
  return "home";
}

function App() {
  const [page, setPage] = useState<Page>(getPage);

  useEffect(() => {
    const onHash = () => setPage(getPage());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div className="bg-background-dark min-h-screen overflow-x-hidden relative text-gray-100">
      {/* Background Ambience */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="orb w-[500px] h-[500px] bg-primary/20 top-[-10%] left-[-10%]"></div>
        <div className="orb w-[400px] h-[400px] bg-accent-purple/20 bottom-[-10%] right-[-10%]"></div>
        <div className="orb w-[300px] h-[300px] bg-accent-cyan/20 top-[40%] left-[60%] opacity-20"></div>
        <div className="absolute inset-0 bg-grid-pattern bg-[length:40px_40px] opacity-[0.03]"></div>
      </div>

      <Navbar currentPage={page} />

      <main className="relative z-10">
        {page === "market" ? (
          <MarketplacePage />
        ) : (
          <>
            <Hero />
            <Standards />
            <ProtocolFlow />
            <Infrastructure />
            <Developers />
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}

export default App;
