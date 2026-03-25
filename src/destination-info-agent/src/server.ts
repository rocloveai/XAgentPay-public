#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import {
  extractX402Payment,
  buildPaymentRequired,
  buildPaymentRequiredResult,
  buildPaidToolResult,
  processX402Payment,
  formatUsdcAmount,
  type X402ToolConfig,
} from "@xagentpay/x402";
import type { IncomingMessage, ServerResponse } from "node:http";
import * as http from "node:http";

const config = loadConfig();

// ── Mock destination data ─────────────────────────────────────────────────

const DESTINATION_DATA: Record<string, {
  visa: string;
  weather: Record<string, string>;
  tips: string[];
  currency: string;
  language: string;
}> = {
  singapore: {
    visa: "Visa-free for Chinese passport holders, up to 30 days.",
    weather: {
      jan: "Hot & humid, 25-32°C. Occasional rain.",
      feb: "Hot & humid, 25-32°C. Drier month.",
      mar: "Hot & humid, 25-33°C. Some rain.",
      apr: "Hot, 26-33°C. Start of wet season.",
      may: "Hot & wet, 26-33°C. Frequent afternoon showers.",
      jun: "Hot & wet, 26-33°C.",
      jul: "Hot, 26-32°C. Relatively drier.",
      aug: "Hot, 26-32°C. Relatively drier.",
      sep: "Hot & wet, 26-32°C.",
      oct: "Hot & very wet, 25-32°C. Peak rain season.",
      nov: "Hot & very wet, 25-31°C.",
      dec: "Hot & wet, 25-31°C. Northeast monsoon.",
    },
    tips: [
      "MRT is the easiest way to get around — buy an EZ-Link card.",
      "Chewing gum is banned. Respect local regulations.",
      "Marina Bay Sands rooftop infinity pool is for hotel guests only.",
      "Hawker centres offer the best local food at low prices (S$3-8 per dish).",
      "GST refund available for purchases over S$100 at participating stores.",
    ],
    currency: "SGD (Singapore Dollar). 1 USD ≈ 1.35 SGD.",
    language: "English, Mandarin, Malay, Tamil. English is widely spoken.",
  },
  japan: {
    visa: "Visa-free for Chinese passport holders (since 2024 trial program). Check latest policy before travel.",
    weather: {
      jan: "Cold, 2-10°C in Tokyo. Snow possible. Peak ski season.",
      feb: "Cold, 3-11°C. Plum blossoms start blooming.",
      mar: "Mild, 6-15°C. Early cherry blossoms late March.",
      apr: "Warm, 12-19°C. Peak cherry blossom season.",
      may: "Pleasant, 16-23°C. Golden Week holidays.",
      jun: "Rainy season begins, 20-26°C.",
      jul: "Hot & humid, 24-30°C. Rainy season ends.",
      aug: "Hot & humid, 26-32°C. Summer festivals.",
      sep: "Warm, 22-28°C. Typhoon season.",
      oct: "Cool, 16-22°C. Autumn foliage starts.",
      nov: "Cool, 10-17°C. Peak autumn foliage.",
      dec: "Cold, 5-12°C. Christmas illuminations.",
    },
    tips: [
      "Get a Suica or Pasmo IC card for trains and convenience stores.",
      "Cash is still widely used — carry some yen.",
      "7-Eleven, FamilyMart ATMs accept international cards.",
      "Tipping is NOT customary — it can be considered rude.",
      "JR Pass worth it if traveling between cities.",
    ],
    currency: "JPY (Japanese Yen). 1 USD ≈ 150 JPY.",
    language: "Japanese. English signage in major cities and tourist areas.",
  },
  thailand: {
    visa: "Visa-free for Chinese passport holders, up to 30 days.",
    weather: {
      jan: "Cool & dry, 20-32°C. Best season to visit.",
      feb: "Cool & dry, 22-33°C. Excellent weather.",
      mar: "Hot & dry, 24-35°C. Getting warmer.",
      apr: "Very hot, 26-36°C. Songkran water festival.",
      may: "Hot & wet, 25-34°C. Rainy season begins.",
      jun: "Wet, 25-32°C. Heavy rains on west coast.",
      jul: "Wet, 24-32°C.",
      aug: "Wet, 24-32°C.",
      sep: "Wettest month, 24-31°C.",
      oct: "Wet, 24-31°C. Flooding possible.",
      nov: "Drier, 22-31°C. Good time to visit.",
      dec: "Cool & dry, 20-31°C. Peak tourist season.",
    },
    tips: [
      "Dress modestly when visiting temples — cover shoulders and knees.",
      "Never point feet toward Buddha images or people.",
      "Grab is the main ride-hailing app.",
      "Negotiate prices at markets — it's expected.",
      "Tap water is not safe to drink — buy bottled water.",
    ],
    currency: "THB (Thai Baht). 1 USD ≈ 35 THB.",
    language: "Thai. English spoken in tourist areas.",
  },
};

// ── Mock itinerary data ───────────────────────────────────────────────────

const ITINERARY_TEMPLATES: Record<string, {
  highlights: string[];
  dayPlans: Record<number, string[]>;
}> = {
  singapore: {
    highlights: ["Gardens by the Bay", "Marina Bay Sands", "Sentosa Island", "Chinatown", "Little India", "Clarke Quay"],
    dayPlans: {
      1: ["Morning: Merlion Park & Marina Bay waterfront", "Afternoon: Gardens by the Bay (Cloud Forest + Flower Dome)", "Evening: Marina Bay Sands SkyPark observation deck", "Dinner: Hawker food at Maxwell Food Centre"],
      2: ["Morning: Chinatown (Buddha Tooth Relic Temple)", "Afternoon: Little India & Arab Street", "Evening: Clarke Quay rooftop bars"],
      3: ["Morning: Sentosa Island (Universal Studios or beaches)", "Afternoon: VivoCity shopping", "Evening: Night Safari at Singapore Zoo"],
      4: ["Morning: Botanic Gardens (UNESCO Heritage)", "Afternoon: Orchard Road shopping", "Evening: Lau Pa Sat hawker centre"],
      5: ["Morning: Pulau Ubin island day trip", "Afternoon: East Coast Park cycling", "Evening: Departure or rest"],
    },
  },
  japan: {
    highlights: ["Shibuya Crossing", "Mount Fuji", "Kyoto temples", "Osaka food scene", "Akihabara", "Nara deer park"],
    dayPlans: {
      1: ["Morning: Arrive Tokyo, check in Shinjuku", "Afternoon: Meiji Shrine & Harajuku", "Evening: Shibuya Crossing & dinner"],
      2: ["Morning: Tsukiji Outer Market breakfast", "Afternoon: Asakusa & Senso-ji Temple", "Evening: Tokyo Skytree views"],
      3: ["Morning: Akihabara electronics & anime", "Afternoon: Imperial Palace East Garden", "Evening: Ginza luxury shopping"],
      4: ["Day trip: Mount Fuji (Hakone route)", "Afternoon: Hakone hot springs (onsen)", "Evening: Return Tokyo"],
      5: ["Shinkansen to Kyoto", "Afternoon: Fushimi Inari Shrine", "Evening: Gion district walk"],
      6: ["Morning: Arashiyama bamboo grove", "Afternoon: Kinkaku-ji (Golden Pavilion)", "Evening: Nishiki Market street food"],
      7: ["Day trip to Nara (deer park + Todai-ji)", "Evening: Osaka for dinner (Dotonbori)"],
    },
  },
  thailand: {
    highlights: ["Grand Palace", "Phi Phi Islands", "Chiang Mai temples", "Floating markets", "Elephant sanctuary", "Night markets"],
    dayPlans: {
      1: ["Morning: Grand Palace & Wat Phra Kaew", "Afternoon: Wat Pho (reclining Buddha)", "Evening: Khao San Road area"],
      2: ["Morning: Chatuchak Weekend Market (weekends)", "Afternoon: Jim Thompson House", "Evening: Chao Phraya river cruise dinner"],
      3: ["Morning: Floating market day trip (Amphawa)", "Afternoon: Maeklong Railway Market", "Evening: Street food at Or Tor Kor Market"],
      4: ["Fly to Chiang Mai", "Afternoon: Doi Suthep temple", "Evening: Sunday Walking Street night market"],
      5: ["Morning: Elephant Nature Park (ethical sanctuary)", "Afternoon: Old City temples walk", "Evening: Thai cooking class"],
      6: ["Fly to Phuket or Krabi", "Afternoon: Beach & snorkeling", "Evening: Seafood by the beach"],
      7: ["Island hopping: Phi Phi Islands", "Evening: Patong Beach or rest"],
    },
  },
};

function normalizeDestination(raw: string): string {
  return raw.toLowerCase().trim();
}

function getDestinationInfo(destination: string, month?: string): string {
  const key = normalizeDestination(destination);
  const data = DESTINATION_DATA[key];

  if (!data) {
    const available = Object.keys(DESTINATION_DATA).join(", ");
    return `Destination "${destination}" not found in our database.\nCurrently available: ${available}.`;
  }

  const lines: string[] = [];
  lines.push(`📍 ${destination.charAt(0).toUpperCase() + destination.slice(1)} Travel Guide`);
  lines.push(`\n🛂 Visa: ${data.visa}`);
  lines.push(`\n💱 Currency: ${data.currency}`);
  lines.push(`\n🗣️ Language: ${data.language}`);

  if (month) {
    const m = month.toLowerCase().slice(0, 3);
    const weather = data.weather[m];
    if (weather) {
      lines.push(`\n🌤️ Weather (${month}): ${weather}`);
    }
  } else {
    lines.push(`\n🌤️ Weather: Use month parameter for specific forecast.`);
  }

  lines.push(`\n💡 Travel Tips:`);
  data.tips.forEach((tip, i) => lines.push(`  ${i + 1}. ${tip}`));

  return lines.join("\n");
}

// ── MCP Server factory ────────────────────────────────────────────────────

function createMcpServer(): McpServer {
  const srv = new McpServer({
    name: "xagent-destination-info",
    version: "1.0.0",
  });

  // ── x402 Payment Configurations ──────────────────────────────────────────
  const x402Config: X402ToolConfig = {
    toolName: "get_destination_info",
    priceUsdcAtomic: config.x402PriceAtomic,
    payTo: config.paymentAddress,
    resourceDescription: "Travel destination info (visa, weather, tips)",
    signerPrivateKey: config.relayerPrivateKey,
  };

  const x402WeatherConfig: X402ToolConfig = {
    toolName: "get_weather_forecast",
    priceUsdcAtomic: config.x402PriceAtomic,
    payTo: config.paymentAddress,
    resourceDescription: "Monthly weather forecast for travel destination",
    signerPrivateKey: config.relayerPrivateKey,
  };

  const x402ItineraryConfig: X402ToolConfig = {
    toolName: "plan_itinerary",
    priceUsdcAtomic: String(Number(config.x402PriceAtomic) * 5), // 0.05 USDC for itinerary
    payTo: config.paymentAddress,
    resourceDescription: "AI-generated day-by-day travel itinerary",
    signerPrivateKey: config.relayerPrivateKey,
  };

  // ── Tool: get_destination_info (x402 hard gate) ──────────────────────────

  srv.tool(
    "get_destination_info",
    "Get travel information for a destination: visa requirements, weather, currency, and local tips. " +
      "Powered by x402 protocol — requires a signed EIP-3009 payment of 0.01 USDC in _meta['x402/payment']. " +
      "No payment = no data returned.",
    {
      destination: z
        .string()
        .describe("Destination city or country (e.g. Singapore, Japan, Thailand)"),
      month: z
        .string()
        .optional()
        .describe("Travel month for weather info (e.g. 'March', 'Jul')"),
    },
    async ({ destination, month }, extra) => {
      // x402 hard gate — no payment, no data
      const payment = extractX402Payment(
        (extra as any)?._meta ?? (extra as any)?.meta,
      );

      if (!payment) {
        const pr = buildPaymentRequired(x402Config);
        // Hard gate: return ONLY PaymentRequired, no data leaked
        return buildPaymentRequiredResult(pr);
      }

      // Verify and settle payment
      const payResult = await processX402Payment(payment, x402Config);
      if ("error" in payResult) {
        return buildPaymentRequiredResult(payResult.error);
      }

      // Payment verified — return destination info
      const info = getDestinationInfo(destination, month);
      const paidText =
        `✅ x402 Payment settled on XLayer!\n` +
        `TX: ${payResult.settled.transaction}\n` +
        `Amount: ${formatUsdcAmount(config.x402PriceAtomic)} USDC\n\n` +
        info;

      return buildPaidToolResult(paidText, payResult.settled);
    },
  );

  // ── Tool: get_weather_forecast (x402 hard gate) ──────────────────────────

  srv.tool(
    "get_weather_forecast",
    "Get detailed monthly weather forecast for a travel destination. " +
      "Returns temperature range, rainfall, and travel suitability for each month. " +
      "Powered by x402 protocol — requires 0.01 USDC payment in _meta['x402/payment'].",
    {
      destination: z
        .string()
        .describe("Destination city or country (e.g. Singapore, Japan, Thailand)"),
      month: z
        .string()
        .optional()
        .describe("Specific month (e.g. 'March'). Omit for full year overview."),
    },
    async ({ destination, month }, extra) => {
      const payment = extractX402Payment(
        (extra as any)?._meta ?? (extra as any)?.meta,
      );
      if (!payment) {
        return buildPaymentRequiredResult(buildPaymentRequired(x402WeatherConfig));
      }
      const payResult = await processX402Payment(payment, x402WeatherConfig);
      if ("error" in payResult) {
        return buildPaymentRequiredResult(payResult.error);
      }

      const key = normalizeDestination(destination);
      const data = DESTINATION_DATA[key];
      if (!data) {
        const available = Object.keys(DESTINATION_DATA).join(", ");
        return buildPaidToolResult(
          `Destination "${destination}" not found. Available: ${available}.`,
          payResult.settled,
        );
      }

      const lines: string[] = [];
      const destTitle = destination.charAt(0).toUpperCase() + destination.slice(1);
      lines.push(`🌤️ Weather Forecast — ${destTitle}`);

      if (month) {
        const m = month.toLowerCase().slice(0, 3);
        const w = data.weather[m];
        lines.push(w ? `\n${month}: ${w}` : `\nNo data for month: ${month}`);
      } else {
        lines.push("\n📅 Full Year Overview:");
        const monthNames: Record<string, string> = {
          jan: "January", feb: "February", mar: "March", apr: "April",
          may: "May", jun: "June", jul: "July", aug: "August",
          sep: "September", oct: "October", nov: "November", dec: "December",
        };
        for (const [k, label] of Object.entries(monthNames)) {
          if (data.weather[k]) lines.push(`  ${label}: ${data.weather[k]}`);
        }
      }
      lines.push(`\n✅ x402 settled | TX: ${payResult.settled.transaction}`);

      return buildPaidToolResult(lines.join("\n"), payResult.settled);
    },
  );

  // ── Tool: plan_itinerary (x402 hard gate, 0.05 USDC) ─────────────────────

  srv.tool(
    "plan_itinerary",
    "Generate a day-by-day travel itinerary for a destination. " +
      "Includes must-see highlights, activity schedule, food recommendations, and local tips. " +
      "Powered by x402 protocol — requires 0.05 USDC payment in _meta['x402/payment'].",
    {
      destination: z
        .string()
        .describe("Destination city or country (e.g. Singapore, Japan, Thailand)"),
      days: z
        .number()
        .min(1)
        .max(7)
        .describe("Number of days (1–7)"),
      interests: z
        .string()
        .optional()
        .describe("Travel interests, e.g. 'food, temples, beaches, shopping'"),
    },
    async ({ destination, days, interests }, extra) => {
      const payment = extractX402Payment(
        (extra as any)?._meta ?? (extra as any)?.meta,
      );
      if (!payment) {
        return buildPaymentRequiredResult(buildPaymentRequired(x402ItineraryConfig));
      }
      const payResult = await processX402Payment(payment, x402ItineraryConfig);
      if ("error" in payResult) {
        return buildPaymentRequiredResult(payResult.error);
      }

      const key = normalizeDestination(destination);
      const template = ITINERARY_TEMPLATES[key];
      if (!template) {
        const available = Object.keys(ITINERARY_TEMPLATES).join(", ");
        return buildPaidToolResult(
          `Destination "${destination}" not found. Available: ${available}.`,
          payResult.settled,
        );
      }

      const destTitle = destination.charAt(0).toUpperCase() + destination.slice(1);
      const lines: string[] = [];
      lines.push(`🗺️ ${days}-Day Itinerary — ${destTitle}`);
      if (interests) lines.push(`🎯 Tailored for: ${interests}`);
      lines.push(`\n✨ Highlights: ${template.highlights.slice(0, 4).join(", ")}`);
      lines.push("");

      for (let d = 1; d <= days; d++) {
        lines.push(`📅 Day ${d}:`);
        const plan = template.dayPlans[d] ?? template.dayPlans[1];
        plan.forEach(item => lines.push(`  • ${item}`));
        lines.push("");
      }

      const destData = DESTINATION_DATA[key];
      if (destData) {
        lines.push(`💡 Reminders:`);
        destData.tips.slice(0, 3).forEach(tip => lines.push(`  • ${tip}`));
        lines.push(`\n💱 Currency: ${destData.currency}`);
      }

      lines.push(`\n✅ x402 settled (0.05 USDC) | TX: ${payResult.settled.transaction}`);

      return buildPaidToolResult(lines.join("\n"), payResult.settled);
    },
  );

  return srv;
}

// ── HTTP Server ───────────────────────────────────────────────────────────

const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Serve skill.md
  if (req.method === "GET" && req.url === "/skill.md") {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    try {
      const skillMd = await fs.readFile(path.join(__dirname, "../skill.md"), "utf-8");
      res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8" });
      res.end(skillMd);
    } catch {
      res.writeHead(404);
      res.end("skill.md not found");
    }
    return;
  }

  // Health check
  if (req.method === "GET" && (req.url === "/health" || req.url === "/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "destination-info-agent", version: "1.0.0" }));
    return;
  }

  // MCP endpoint
  if (req.url === "/mcp" || req.url?.startsWith("/mcp?")) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    const mcpServer = createMcpServer();
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(config.portalPort, () => {
  console.log(`[destination-info-agent] Listening on port ${config.portalPort}`);
  console.log(`[destination-info-agent] x402 price: ${formatUsdcAmount(config.x402PriceAtomic)} USDC per query`);
});

process.on("SIGTERM", () => { server.close(); process.exit(0); });
process.on("SIGINT", () => { server.close(); process.exit(0); });
