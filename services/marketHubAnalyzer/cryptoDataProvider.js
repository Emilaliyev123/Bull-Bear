const { fetchBinanceCryptoCandles, validateNormalizedCandles } = require("./binanceCryptoProvider");
const { getMockMarketData } = require("./mockDataProvider");

function providerFailureCode(error) {
  const code = String(error?.code || "PROVIDER_UNAVAILABLE").toUpperCase();
  return /^[A-Z0-9_]{3,40}$/.test(code) ? code : "PROVIDER_UNAVAILABLE";
}

async function getCryptoMarketData(request, options = {}) {
  const provider = options.provider || fetchBinanceCryptoCandles;
  try {
    const response = await provider(request, options.providerOptions || {});
    const candles = validateNormalizedCandles(response?.candles);
    const context = getMockMarketData(request);
    return {
      ...context,
      candles,
      newsRisk: {
        level: "unknown",
        event: "Live news feed is not connected. Check major crypto, exchange, and macro events independently."
      },
      volatilityRisk: {
        level: "normal",
        reason: "ATR-based volatility risk will be calculated from live Binance candles."
      },
      btcTrend: request.asset === "BTC" ? "self-filter" : "unavailable",
      dataStatus: {
        status: "live",
        provider: "Binance public market data",
        message: `Live public OHLCV candles for ${response.symbol || `${request.asset}USDT`} at ${response.interval || request.timeframe}. No exchange account or API key is connected.`
      },
      dataSource: "Binance public market data",
      isDemo: false,
      lastUpdated: response.lastUpdated || candles.at(-1).time,
      liveDataStatus: {
        attempted: true,
        available: true,
        fallbackUsed: false
      }
    };
  } catch (error) {
    const fallback = getMockMarketData(request);
    return {
      ...fallback,
      dataStatus: {
        status: "fallback-demo",
        provider: "Deterministic demo fallback",
        message: "Live Binance public data was unavailable. This result uses deterministic educational demo candles and is not a live market signal."
      },
      dataSource: "Deterministic demo fallback",
      isDemo: true,
      lastUpdated: new Date().toISOString(),
      liveDataStatus: {
        attempted: true,
        available: false,
        fallbackUsed: true,
        reasonCode: providerFailureCode(error)
      }
    };
  }
}

module.exports = {
  getCryptoMarketData,
  providerFailureCode
};
