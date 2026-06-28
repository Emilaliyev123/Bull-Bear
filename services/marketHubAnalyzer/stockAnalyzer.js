const { scoreConfluence } = require("./scoring");
const { assessRiskLevel, highRiskWarning } = require("./risk");
const { createTechnicalAnalysis, EDUCATIONAL_DISCLAIMER } = require("./strategies");

function analyzeStockTrading(request, data) {
  const relativeStrength = data.fundamentals.growth >= 65;
  return createTechnicalAnalysis({
    request,
    data,
    marketSpecific: {
      score: relativeStrength ? 8 : 5,
      detail: `${relativeStrength ? "Positive" : "Mixed"} relative-strength and market-regime placeholders`
    },
    strategies: [
      "Relative strength placeholder",
      "VWAP",
      "Opening-range breakout placeholder",
      "High relative-volume placeholder",
      "Market-regime placeholder"
    ],
    notes: ["Stock trading levels are available only for dayTrading and swingTrading modes."]
  });
}

function analyzeStockResearch(request, data) {
  const fundamentals = data.fundamentals;
  const averageFundamental = Math.round((fundamentals.quality + fundamentals.value + fundamentals.growth + fundamentals.dividend) / 4);
  const components = {
    trend: { score: 6, detail: "Long-term trend placeholder" },
    marketStructure: { score: 6, detail: "Broad market structure placeholder" },
    supportResistance: { score: 5, detail: "Valuation range replaces short-term price levels" },
    liquidity: { score: 7, detail: "Large-cap liquidity assumption in demo data" },
    momentum: { score: Math.round(fundamentals.growth / 10), detail: `Growth quality placeholder ${fundamentals.growth}/100` },
    volume: { score: 6, detail: "Institutional participation placeholder" },
    volatility: { score: data.volatilityRisk.level === "extreme" ? 0 : data.volatilityRisk.level === "elevated" ? 4 : 8, detail: data.volatilityRisk.reason },
    newsRisk: { score: data.newsRisk.level === "extreme" ? 0 : data.newsRisk.level === "elevated" ? 4 : 9, detail: data.newsRisk.event },
    riskReward: { score: 6, detail: "Not expressed as a trade ratio in investing/research mode" },
    marketSpecific: { score: Math.round(averageFundamental / 10), detail: `Composite quality/value/growth/dividend placeholder ${averageFundamental}/100` }
  };
  const confluence = scoreConfluence(components);
  const riskLevel = assessRiskLevel({
    confidenceScore: confluence.total,
    newsRisk: data.newsRisk.level,
    volatilityRisk: data.volatilityRisk.level,
    mode: request.mode
  });
  const extremeRisk = riskLevel === "extreme";
  const marketBias = averageFundamental >= 70 ? "constructive" : averageFundamental >= 50 ? "selective" : "defensive";

  return {
    market: request.market,
    asset: request.asset,
    mode: request.mode,
    timeframe: request.timeframe,
    signalStatus: extremeRisk ? "highRisk" : "neutral",
    confidenceScore: confluence.total,
    riskLevel,
    marketBias,
    entryZone: null,
    stopLoss: null,
    takeProfits: [],
    riskReward: null,
    strategyBreakdown: {
      setupQuality: "research only",
      components: confluence.components,
      strategies: [
        "Quality investing placeholder",
        "Value/growth/dividend summary",
        "DCA framework",
        "Diversification review",
        "Risk-factor review"
      ],
      research: {
        fundamentals,
        dcaIdea: "Split a planned allocation into regular intervals and review the thesis before each addition.",
        riskFactors: ["Valuation compression", "Earnings revisions", "Interest rates", "Sector concentration", "Company-specific execution"]
      }
    },
    explanation: `${request.mode} is a research view with a ${marketBias} demo bias. It intentionally has no trading entry, stop, or take-profit levels. ${EDUCATIONAL_DISCLAIMER}`,
    invalidationRule: "Reassess if the investment thesis, balance-sheet quality, earnings durability, or diversification limits materially deteriorate.",
    noSignalReason: "Research and long-term modes do not produce short-term trading signals.",
    highRiskWarning: highRiskWarning(riskLevel, confluence.total),
    dataStatus: data.dataStatus,
    isDemo: true,
    lastUpdated: new Date().toISOString(),
    metadata: {
      educationalDisclaimer: EDUCATIONAL_DISCLAIMER,
      executionEnabled: false,
      orderPlacementSupported: false,
      modelVersion: "market-hub-analyzer-v2"
    }
  };
}

function analyzeStocks(request, data) {
  if (request.mode === "dayTrading" || request.mode === "swingTrading") {
    return analyzeStockTrading(request, data);
  }
  return analyzeStockResearch(request, data);
}

module.exports = { analyzeStocks };
