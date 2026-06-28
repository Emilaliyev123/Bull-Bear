const { buildTechnicalSnapshot, calculateLevelRiskReward, createTechnicalAnalysis } = require("./strategies");

const EXTREME_ATR_PERCENT = {
  "5m": 2,
  "15m": 2.8,
  "1h": 4,
  "4h": 6,
  "1d": 10,
  "1w": 18
};

function liveVolatilityRisk(snapshot, timeframe) {
  const extremeThreshold = EXTREME_ATR_PERCENT[timeframe] || 5;
  if (snapshot.atrPercent >= extremeThreshold) {
    return { level: "extreme", reason: `Live ATR(14) is ${snapshot.atrPercent.toFixed(2)}% of price, above the ${extremeThreshold}% safety threshold.` };
  }
  if (snapshot.atrPercent >= extremeThreshold * 0.6) {
    return { level: "elevated", reason: `Live ATR(14) is ${snapshot.atrPercent.toFixed(2)}% of price, indicating elevated volatility.` };
  }
  return { level: "normal", reason: `Live ATR(14) is ${snapshot.atrPercent.toFixed(2)}% of price and remains within the timeframe threshold.` };
}

function analyzeCrypto(request, data) {
  const snapshot = buildTechnicalSnapshot(data);
  const isLive = data.dataStatus?.status === "live";
  if (isLive) data.volatilityRisk = liveVolatilityRisk(snapshot, request.timeframe);
  const btcAligned = request.asset === "BTC" || data.btcTrend === "neutral"
    || (data.btcTrend === "bullish" && data.candles.at(-1).close >= data.candles.at(-20).close)
    || (data.btcTrend === "bearish" && data.candles.at(-1).close < data.candles.at(-20).close);
  const marketSpecificScore = isLive && request.asset !== "BTC" ? 5 : btcAligned ? 8 : 4;
  const marketSpecificDetail = isLive
    ? request.asset === "BTC"
      ? `BTC self-filter follows live EMA and market structure; funding rate, open interest, and dominance are not connected yet`
      : `BTC trend filter is not connected in V1; ${request.asset} uses live Binance candles with crypto liquidity risk controls`
    : `BTC trend filter placeholder is ${data.btcTrend}; crypto liquidity risk remains simulated`;
  return createTechnicalAnalysis({
    request,
    data,
    marketSpecific: {
      score: marketSpecificScore,
      detail: marketSpecificDetail
    },
    strategies: [
      "Market structure",
      "EMA trend",
      "Support and resistance",
      "Liquidity sweep",
      "VWAP-style intraday context",
      "RSI divergence placeholder",
      "Volume confirmation",
      "BTC trend filter placeholder",
      "Crypto liquidity risk"
    ],
    notes: isLive
      ? ["OHLCV is read-only public Binance kline data. No account, API key, or order capability is connected.", "News, funding rate, open interest, and BTC dominance remain placeholders for later versions."]
      : [data.dataStatus?.status === "fallback-demo"
        ? "Binance public data was unavailable, so deterministic server-side demo OHLCV is being used."
        : "OHLCV and volume are deterministic mock values generated on the server."],
    riskReward: isLive ? calculateLevelRiskReward(snapshot, request.mode) : undefined
  });
}

module.exports = { analyzeCrypto, liveVolatilityRisk };
