import type { EsimPlan } from "../types.js";

interface SearchParams {
  readonly country: string;
  readonly days?: number;
  readonly data_gb?: number;
}

// ---------------------------------------------------------------------------
// Mock eSIM plan database — 6 popular countries + global fallback
// ---------------------------------------------------------------------------

const PLANS_DB: Record<string, EsimPlan[]> = {
  japan: [
    {
      offer_id: "esim_japan_1gb_7d",
      country: "Japan",
      country_code: "JP",
      data_gb: 1,
      days: 7,
      provider: "GlobaleSIM",
      network: "NTT Docomo / SoftBank",
      price: { amount: "4.99", currency: "USD" },
    },
    {
      offer_id: "esim_japan_3gb_15d",
      country: "Japan",
      country_code: "JP",
      data_gb: 3,
      days: 15,
      provider: "GlobaleSIM",
      network: "NTT Docomo / SoftBank",
      price: { amount: "9.99", currency: "USD" },
    },
    {
      offer_id: "esim_japan_5gb_30d",
      country: "Japan",
      country_code: "JP",
      data_gb: 5,
      days: 30,
      provider: "GlobaleSIM",
      network: "NTT Docomo / SoftBank",
      price: { amount: "14.99", currency: "USD" },
    },
  ],
  thailand: [
    {
      offer_id: "esim_thailand_1gb_7d",
      country: "Thailand",
      country_code: "TH",
      data_gb: 1,
      days: 7,
      provider: "GlobaleSIM",
      network: "AIS / DTAC",
      price: { amount: "3.99", currency: "USD" },
    },
    {
      offer_id: "esim_thailand_3gb_15d",
      country: "Thailand",
      country_code: "TH",
      data_gb: 3,
      days: 15,
      provider: "GlobaleSIM",
      network: "AIS / DTAC",
      price: { amount: "7.99", currency: "USD" },
    },
    {
      offer_id: "esim_thailand_5gb_30d",
      country: "Thailand",
      country_code: "TH",
      data_gb: 5,
      days: 30,
      provider: "GlobaleSIM",
      network: "AIS / DTAC",
      price: { amount: "12.99", currency: "USD" },
    },
  ],
  singapore: [
    {
      offer_id: "esim_singapore_1gb_7d",
      country: "Singapore",
      country_code: "SG",
      data_gb: 1,
      days: 7,
      provider: "GlobaleSIM",
      network: "Singtel / StarHub",
      price: { amount: "4.49", currency: "USD" },
    },
    {
      offer_id: "esim_singapore_3gb_15d",
      country: "Singapore",
      country_code: "SG",
      data_gb: 3,
      days: 15,
      provider: "GlobaleSIM",
      network: "Singtel / StarHub",
      price: { amount: "8.99", currency: "USD" },
    },
    {
      offer_id: "esim_singapore_5gb_30d",
      country: "Singapore",
      country_code: "SG",
      data_gb: 5,
      days: 30,
      provider: "GlobaleSIM",
      network: "Singtel / StarHub",
      price: { amount: "13.99", currency: "USD" },
    },
  ],
  "south korea": [
    {
      offer_id: "esim_korea_1gb_7d",
      country: "South Korea",
      country_code: "KR",
      data_gb: 1,
      days: 7,
      provider: "GlobaleSIM",
      network: "SK Telecom / KT",
      price: { amount: "4.99", currency: "USD" },
    },
    {
      offer_id: "esim_korea_3gb_15d",
      country: "South Korea",
      country_code: "KR",
      data_gb: 3,
      days: 15,
      provider: "GlobaleSIM",
      network: "SK Telecom / KT",
      price: { amount: "9.49", currency: "USD" },
    },
    {
      offer_id: "esim_korea_5gb_30d",
      country: "South Korea",
      country_code: "KR",
      data_gb: 5,
      days: 30,
      provider: "GlobaleSIM",
      network: "SK Telecom / KT",
      price: { amount: "14.49", currency: "USD" },
    },
  ],
  usa: [
    {
      offer_id: "esim_usa_1gb_7d",
      country: "United States",
      country_code: "US",
      data_gb: 1,
      days: 7,
      provider: "GlobaleSIM",
      network: "T-Mobile / AT&T",
      price: { amount: "5.99", currency: "USD" },
    },
    {
      offer_id: "esim_usa_3gb_15d",
      country: "United States",
      country_code: "US",
      data_gb: 3,
      days: 15,
      provider: "GlobaleSIM",
      network: "T-Mobile / AT&T",
      price: { amount: "11.99", currency: "USD" },
    },
    {
      offer_id: "esim_usa_5gb_30d",
      country: "United States",
      country_code: "US",
      data_gb: 5,
      days: 30,
      provider: "GlobaleSIM",
      network: "T-Mobile / AT&T",
      price: { amount: "17.99", currency: "USD" },
    },
  ],
  uk: [
    {
      offer_id: "esim_uk_1gb_7d",
      country: "United Kingdom",
      country_code: "GB",
      data_gb: 1,
      days: 7,
      provider: "GlobaleSIM",
      network: "Three / EE",
      price: { amount: "4.49", currency: "USD" },
    },
    {
      offer_id: "esim_uk_3gb_15d",
      country: "United Kingdom",
      country_code: "GB",
      data_gb: 3,
      days: 15,
      provider: "GlobaleSIM",
      network: "Three / EE",
      price: { amount: "8.99", currency: "USD" },
    },
    {
      offer_id: "esim_uk_5gb_30d",
      country: "United Kingdom",
      country_code: "GB",
      data_gb: 5,
      days: 30,
      provider: "GlobaleSIM",
      network: "Three / EE",
      price: { amount: "13.99", currency: "USD" },
    },
  ],
};

// Aliases: country code → key, common names → key
const COUNTRY_ALIASES: Record<string, string> = {
  jp: "japan",
  th: "thailand",
  sg: "singapore",
  kr: "south korea",
  korea: "south korea",
  "s. korea": "south korea",
  us: "usa",
  "united states": "usa",
  america: "usa",
  gb: "uk",
  "united kingdom": "uk",
  britain: "uk",
  england: "uk",
};

function resolveCountryKey(input: string): string {
  const lower = input.toLowerCase().trim();
  return COUNTRY_ALIASES[lower] ?? lower;
}

function getGlobalFallback(country: string): EsimPlan[] {
  return [
    {
      offer_id: `esim_global_1gb_7d`,
      country: country || "Global",
      country_code: "XX",
      data_gb: 1,
      days: 7,
      provider: "GlobaleSIM",
      network: "Multi-carrier Roaming",
      price: { amount: "6.99", currency: "USD" },
    },
    {
      offer_id: `esim_global_3gb_15d`,
      country: country || "Global",
      country_code: "XX",
      data_gb: 3,
      days: 15,
      provider: "GlobaleSIM",
      network: "Multi-carrier Roaming",
      price: { amount: "12.99", currency: "USD" },
    },
    {
      offer_id: `esim_global_5gb_30d`,
      country: country || "Global",
      country_code: "XX",
      data_gb: 5,
      days: 30,
      provider: "GlobaleSIM",
      network: "Multi-carrier Roaming",
      price: { amount: "19.99", currency: "USD" },
    },
  ];
}

export async function searchEsimPlans(
  params: SearchParams,
): Promise<{ plans: readonly EsimPlan[]; error?: string }> {
  const key = resolveCountryKey(params.country);
  let plans = PLANS_DB[key];

  if (!plans) {
    return {
      plans: getGlobalFallback(params.country),
      error: `No specific plans for "${params.country}", showing global roaming plans`,
    };
  }

  // Filter by days if specified
  if (params.days) {
    const filtered = plans.filter((p) => p.days >= params.days!);
    if (filtered.length > 0) plans = filtered;
  }

  // Filter by data_gb if specified
  if (params.data_gb) {
    const filtered = plans.filter((p) => p.data_gb >= params.data_gb!);
    if (filtered.length > 0) plans = filtered;
  }

  return { plans };
}
