const STATIC_EVENTS = [
  {
    id: "fomc-jul-2026",
    title: "FOMC Rate Decision",
    category: "central_bank",
    scheduledTime: "2026-07-29T18:00:00.000Z",
    country: "US",
    currency: "USD",
    importance: "extreme",
    tags: ["macro", "fed"]
  },
  {
    id: "fomc-sep-2026",
    title: "FOMC Rate Decision",
    category: "central_bank",
    scheduledTime: "2026-09-16T18:00:00.000Z",
    country: "US",
    currency: "USD",
    importance: "extreme",
    tags: ["macro", "fed"]
  },
  {
    id: "cpi-jul-2026",
    title: "CPI Inflation",
    category: "inflation",
    scheduledTime: "2026-07-15T12:30:00.000Z",
    country: "US",
    currency: "USD",
    importance: "extreme",
    tags: ["macro", "inflation"]
  },
  {
    id: "cpi-aug-2026",
    title: "CPI Inflation",
    category: "inflation",
    scheduledTime: "2026-08-12T12:30:00.000Z",
    country: "US",
    currency: "USD",
    importance: "extreme",
    tags: ["macro", "inflation"]
  },
  {
    id: "nfp-aug-2026",
    title: "Non-Farm Payrolls",
    category: "employment",
    scheduledTime: "2026-08-07T12:30:00.000Z",
    country: "US",
    currency: "USD",
    importance: "extreme",
    tags: ["macro", "employment"]
  },
  {
    id: "ppi-jul-2026",
    title: "PPI Inflation",
    category: "inflation",
    scheduledTime: "2026-07-16T12:30:00.000Z",
    country: "US",
    currency: "USD",
    importance: "high",
    tags: ["macro", "inflation"]
  },
  {
    id: "powell-speech-1",
    title: "Fed Chair Powell Speaks",
    category: "central_bank",
    scheduledTime: "2026-07-17T14:00:00.000Z",
    country: "US",
    currency: "USD",
    importance: "high",
    tags: ["macro", "fed"]
  },
  {
    id: "eia-jul-8-2026",
    title: "EIA Crude Oil Inventories",
    category: "energy",
    scheduledTime: "2026-07-08T14:30:00.000Z",
    country: "US",
    currency: "USD",
    importance: "high",
    tags: ["energy", "oil"]
  },
  {
    id: "eia-jul-15-2026",
    title: "EIA Crude Oil Inventories",
    category: "energy",
    scheduledTime: "2026-07-15T14:30:00.000Z",
    country: "US",
    currency: "USD",
    importance: "high",
    tags: ["energy", "oil"]
  },
  {
    id: "ecb-jul-2026",
    title: "ECB Interest Rate Decision",
    category: "central_bank",
    scheduledTime: "2026-07-16T12:15:00.000Z",
    country: "EU",
    currency: "EUR",
    importance: "extreme",
    tags: ["macro", "ecb"]
  },
  {
    id: "crypto-etf-decision",
    title: "Spot ETF Application Decision",
    category: "crypto_regulation",
    scheduledTime: "2026-07-10T20:00:00.000Z",
    country: "US",
    currency: "USD",
    importance: "high",
    tags: ["crypto", "etf"]
  },
  {
    id: "aapl-earnings-q2",
    title: "AAPL Q2 Earnings",
    category: "corporate_earnings",
    scheduledTime: "2026-07-23T20:00:00.000Z",
    country: "US",
    currency: "USD",
    importance: "high",
    tags: ["stocks", "earnings"],
    relatedAsset: "AAPL"
  },
  {
    id: "pmi-eu-jul",
    title: "Eurozone Manufacturing PMI",
    category: "growth",
    scheduledTime: "2026-07-24T08:00:00.000Z",
    country: "EU",
    currency: "EUR",
    importance: "high",
    tags: ["macro", "pmi"]
  },
  {
    id: "minor-us-data",
    title: "US Minor Economic Data",
    category: "growth",
    scheduledTime: "2026-07-06T12:30:00.000Z",
    country: "US",
    currency: "USD",
    importance: "medium",
    tags: ["macro"]
  }
];

function isEventRelevant(event, market, asset) {
  const { category, currency, tags = [], relatedAsset, importance } = event;

  if (market === "crypto") {
    // Sensitive to USD macro events and crypto placeholders
    if (currency === "USD" && tags.includes("macro")) return true;
    if (tags.includes("crypto")) return true;
    return false;
  }

  if (market === "forex") {
    // Relevant if the event's country/currency is found in the traded currency pair string
    const pair = asset || "";
    if (currency && pair.includes(currency)) return true;
    // Assume USD is base impact for most pairs if it's extreme
    if (currency === "USD" && importance === "extreme") return true;
    return false;
  }

  if (market === "gold") {
    // Sensitive to USD macro, Fed decisions, and global geopolitical risk indicators
    if (currency === "USD" && tags.includes("macro")) return true;
    if (tags.includes("fed")) return true;
    if (tags.includes("geopolitical")) return true;
    return false;
  }

  if (market === "stocks") {
    // Sensitive to systemic extreme USD macro events and symbol-specific corporate earnings
    if (currency === "USD" && importance === "extreme" && tags.includes("macro")) return true;
    if (category === "corporate_earnings" && relatedAsset === asset) return true;
    return false;
  }

  if (market === "commodities") {
    // Oil must match EIA inventory and OPEC events
    if (asset === "OIL") {
      if (tags.includes("oil") || tags.includes("opec") || event.title.includes("EIA")) return true;
      if (currency === "USD" && importance === "extreme") return true; // Dollar impact
      return false;
    }
    // Others match USD and global PMI
    if (currency === "USD" && tags.includes("macro")) return true;
    if (tags.includes("pmi")) return true;
    return false;
  }

  return false;
}

const PROVIDER_REGISTRY = {
  "trading-economics": null,
  "financial-modeling-prep": null,
  "finnhub": null
};

module.exports = {
  STATIC_EVENTS,
  isEventRelevant,
  PROVIDER_REGISTRY
};
