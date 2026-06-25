(function marketHubService() {
  const now = () => new Date().toISOString();

  const cryptoAssets = ["BTC", "ETH", "XRP", "SOL", "BNB", "DOGE", "ADA", "AVAX", "LINK", "TON", "TRX", "DOT", "MATIC", "LTC", "BCH", "ATOM"];
  const cryptoPriceIds = {
    BTC: "bitcoin",
    ETH: "ethereum",
    XRP: "ripple",
    SOL: "solana",
    BNB: "binancecoin",
    DOGE: "dogecoin",
    ADA: "cardano",
    AVAX: "avalanche-2",
    LINK: "chainlink",
    TON: "the-open-network",
    TRX: "tron",
    DOT: "polkadot",
    MATIC: "matic-network",
    LTC: "litecoin",
    BCH: "bitcoin-cash",
    ATOM: "cosmos"
  };
  const forexPairs = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "USD/CAD", "NZD/USD", "EUR/JPY", "GBP/JPY", "XAU/USD"];
  const commodityAssets = ["XAU/USD", "Silver", "Oil", "Natural Gas"];
  const stockModes = ["Market Summary", "Long-Term Investment Strategy", "Sector Analysis", "Stock Screener", "Famous Investor Style"];
  const stockOptions = {
    "Market Summary": ["US Market", "Risk-On / Risk-Off", "Macro Watch"],
    "Long-Term Investment Strategy": ["Conservative", "Balanced", "Growth"],
    "Sector Analysis": ["Technology", "Energy", "Financials", "Healthcare", "Consumer", "AI-related stocks", "Defensive stocks"],
    "Stock Screener": ["Quality Growth", "Value", "Dividend", "Momentum", "Defensive"],
    "Famous Investor Style": ["Warren Buffett style", "Peter Lynch style", "Ray Dalio style", "Growth Investing", "Value Investing", "Dividend Investing"]
  };

  const educationLessons = [
    {
      id: "what-is-arbitrage",
      title: "What is Arbitrage?",
      summary: "Arbitrage means comparing prices across venues and looking for a temporary price difference.",
      whenToUse: "Use it when spreads are wide enough to cover fees, slippage, withdrawal cost, and transfer time.",
      risks: "The price gap can close before execution. Withdrawals can be delayed. Low volume can make the spread unusable.",
      analyzerUse: "Start with the scanner, then check volume, route, network, fees, and risk label before considering anything.",
      mistakes: ["Looking only at gross spread", "Ignoring network fees", "Using tiny-volume pairs", "Forgetting transfer delays"]
    },
    {
      id: "day-trading",
      title: "What is Day Trading?",
      summary: "Day trading means looking for intraday moves and closing the idea within the same trading day.",
      whenToUse: "Use it when market sessions have liquidity, clean structure, and a clear invalidation level.",
      risks: "Noise, spreads, news releases, and overtrading can damage performance quickly.",
      analyzerUse: "Use 15m, 1H, and 4H context together. Wait for confirmation near key levels.",
      mistakes: ["Trading every candle", "Moving stop loss", "Chasing after large candles", "Trading news without a plan"]
    },
    {
      id: "swing-trading",
      title: "What is Swing Trading?",
      summary: "Swing trading focuses on multi-day or multi-week price moves instead of every small intraday fluctuation.",
      whenToUse: "Use it when the 4H and 1D trend align and price is near a meaningful level.",
      risks: "Overnight gaps, weekend risk, and macro news can change the setup.",
      analyzerUse: "Use 4H and 1D outputs, then read support, resistance, invalidation, and risk/reward together.",
      mistakes: ["Entering in the middle of a range", "Oversizing", "Ignoring higher timeframe trend", "Taking profit too randomly"]
    },
    {
      id: "long-term-investing",
      title: "What is Long-Term Investing?",
      summary: "Long-term investing focuses on business quality, diversification, valuation, and time horizon.",
      whenToUse: "Use it when the goal is portfolio building, not fast trading.",
      risks: "Concentration, weak companies, high valuation, and panic selling can hurt returns.",
      analyzerUse: "Use the Stocks section for market summary, sector analysis, and investor-style frameworks.",
      mistakes: ["Buying only hype", "No diversification", "Confusing a trade with an investment", "No DCA or review plan"]
    },
    {
      id: "read-signals",
      title: "How to Read Analyzer Signals?",
      summary: "A signal is a structured scenario, not a guarantee. It combines trend, levels, volume, indicators, and risk.",
      whenToUse: "Use it after the market reaches a key level and the setup has confirmation.",
      risks: "A high confidence score can still fail. No model can predict the future.",
      analyzerUse: "Read signal status, entry zone, stop loss, take profits, invalidation, and explanation together.",
      mistakes: ["Treating demo analysis as live advice", "Skipping invalidation", "Ignoring risk/reward", "Entering without confirmation"]
    },
    {
      id: "risk-basics",
      title: "Risk Management Basics",
      summary: "Risk management protects capital by controlling position size, stop loss, leverage, and emotional decisions.",
      whenToUse: "Use it before every trade idea, especially during volatile markets.",
      risks: "Without risk rules, one bad trade can erase many good decisions.",
      analyzerUse: "Check risk level first. If risk is high or no setup is available, waiting is a valid decision.",
      mistakes: ["Risking more than 1-2%", "Using high leverage", "Averaging losers", "Trading major news blindly"]
    }
  ];

  function hashSeed(parts) {
    const raw = parts.join("|");
    let hash = 0;
    for (let i = 0; i < raw.length; i += 1) {
      hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  function round(value, decimals = 2) {
    const power = 10 ** decimals;
    return Math.round(value * power) / power;
  }

  function snapshotPrice(asset) {
    const map = {
      BTC: 59520,
      ETH: 1561.9,
      XRP: 1.033,
      SOL: 66.34,
      BNB: 555.98,
      DOGE: 0.073788,
      ADA: 0.141842,
      AVAX: 6.15,
      LINK: 7.2,
      TON: 1.56,
      TRX: 0.286,
      DOT: 2.37,
      MATIC: 0.2,
      LTC: 74.8,
      BCH: 482,
      ATOM: 2.68,
      "EUR/USD": 1.169,
      "GBP/USD": 1.372,
      "USD/JPY": 144.6,
      "USD/CHF": 0.793,
      "AUD/USD": 0.653,
      "USD/CAD": 1.366,
      "NZD/USD": 0.604,
      "EUR/JPY": 169,
      "GBP/JPY": 198.3,
      "XAU/USD": 4026.92,
      Silver: 47.8,
      Oil: 68.1,
      "Natural Gas": 3.43
    };
    return map[asset] || 100;
  }

  async function getLiveCryptoPrice(asset) {
    const id = cryptoPriceIds[asset];
    if (!id || typeof fetch !== "function") {
      return { price: snapshotPrice(asset), source: "Demo snapshot price", isLivePrice: false };
    }
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 3500) : null;
    try {
      const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd`, {
        headers: { accept: "application/json" },
        signal: controller ? controller.signal : undefined
      });
      if (!response.ok) throw new Error(`price request ${response.status}`);
      const json = await response.json();
      const price = Number(json?.[id]?.usd);
      if (!Number.isFinite(price) || price <= 0) throw new Error("price unavailable");
      return { price, source: "CoinGecko live USD price", isLivePrice: true };
    } catch {
      return { price: snapshotPrice(asset), source: "Demo snapshot price", isLivePrice: false };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  function timeframeVolatility(marketType, timeframe, style) {
    const table = {
      Crypto: { "5m": 0.0032, "15m": 0.005, "1H": 0.0085, "4H": 0.015, "1D": 0.032, "1W": 0.065 },
      Forex: { "5m": 0.0008, "15m": 0.0012, "1H": 0.0022, "4H": 0.0045, "1D": 0.009, "1W": 0.017 },
      Commodities: { "5m": 0.0016, "15m": 0.0024, "1H": 0.0045, "4H": 0.0085, "1D": 0.017, "1W": 0.034 }
    };
    const base = table[marketType]?.[timeframe] || table[marketType]?.["4H"] || 0.01;
    if (style === "Scalping") return base * 0.72;
    if (style === "Swing Trading") return base * 1.35;
    if (style === "Long-Term Investment" || style === "Long-Term Macro View") return base * 1.8;
    return base;
  }

  function decimalPlaces(price) {
    if (price >= 1000) return 2;
    if (price >= 100) return 2;
    if (price >= 1) return 3;
    return 5;
  }

  function formatPrice(value, price) {
    return round(value, decimalPlaces(price));
  }

  function buildMarketResult({ marketType, asset, style, timeframe = "4H", basePrice, dataSource = "Demo snapshot price", isLivePrice = false }) {
    const seed = hashSeed([marketType, asset, style, timeframe]);
    const base = Number(basePrice || snapshotPrice(asset));
    const direction = seed % 5;
    const volatility = timeframeVolatility(marketType, timeframe, style) * (0.86 + (seed % 8) / 50);
    const confidence = direction === 4 ? 42 + (seed % 12) : 58 + (seed % 28);
    const isLong = direction === 0 || direction === 3;
    const isShort = direction === 1 || direction === 2;
    const noSignal = direction === 4 || confidence < 52;
    const riskLevel = confidence >= 76 ? "Low" : confidence >= 62 ? "Medium" : "High";
    const signalStatus = noSignal ? "No High-Quality Setup" : isLong ? "Long" : isShort ? "Short" : "No High-Quality Setup";
    const entryMid = base * (1 + ((seed % 9) - 4) / 10000);
    const entryLow = entryMid * (1 - volatility * 0.35);
    const entryHigh = entryMid * (1 + volatility * 0.35);
    const stop = isLong ? entryLow * (1 - volatility * 0.95) : entryHigh * (1 + volatility * 0.95);
    const tp1 = isLong ? entryHigh * (1 + volatility * 0.8) : entryLow * (1 - volatility * 0.8);
    const tp2 = isLong ? entryHigh * (1 + volatility * 1.55) : entryLow * (1 - volatility * 1.55);
    const tp3 = isLong ? entryHigh * (1 + volatility * 2.35) : entryLow * (1 - volatility * 2.35);
    const support = base * (1 - volatility * 1.6);
    const resistance = base * (1 + volatility * 1.7);
    const pricePrecision = decimalPlaces(base);

    return {
      marketType,
      asset,
      style,
      timeframe,
      demo: true,
      currentPrice: formatPrice(base, base),
      dataSource,
      isLivePrice,
      signalStatus,
      bias: signalStatus,
      entryZone: noSignal ? "Wait for confirmation near key levels" : `${round(entryLow, pricePrecision)} - ${round(entryHigh, pricePrecision)}`,
      stopLoss: noSignal ? "Not active" : round(stop, pricePrecision),
      takeProfits: noSignal ? [] : [
        { label: "TP1", price: round(tp1, pricePrecision), note: "First reaction zone" },
        { label: "TP2", price: round(tp2, pricePrecision), note: "Structure target" },
        { label: "TP3", price: round(tp3, pricePrecision), note: "Extended target" }
      ],
      riskRewardRatio: noSignal ? "N/A" : `1:${round(1.5 + (seed % 18) / 10, 1)}`,
      confidenceScore: noSignal ? Math.min(confidence, 51) : confidence,
      trend: isLong ? "Constructive higher-low structure" : isShort ? "Lower-high pressure" : "Range-bound",
      supportResistance: {
        support: round(support, pricePrecision),
        resistance: round(resistance, pricePrecision)
      },
      liquidityZones: [
        `${round(support * 0.998, pricePrecision)} demand liquidity`,
        `${round(resistance * 1.002, pricePrecision)} supply liquidity`
      ],
      volumeSummary: seed % 3 === 0 ? "Volume is expanding near the active range." : seed % 3 === 1 ? "Volume is average; confirmation is still required." : "Volume is thin; reduce confidence until liquidity improves.",
      indicatorSummary: {
        rsi: noSignal ? "Neutral 45-55 zone" : isLong ? "RSI holding above midline" : "RSI below midline",
        macd: noSignal ? "MACD is flat" : isLong ? "MACD histogram improving" : "MACD momentum fading",
        ema: noSignal ? "EMAs are compressed" : isLong ? "Price holding above short EMA" : "Price below short EMA"
      },
      riskLevel,
      explanation: noSignal
        ? "No high-quality setup right now. Wait for confirmation near key levels."
        : `${asset} is anchored to ${isLivePrice ? "a live USD price" : "the latest demo snapshot price"} near ${round(base, pricePrecision)}. This is an educational ${signalStatus.toLowerCase()} scenario for ${style}; wait for confirmation around the entry zone and invalidate if price breaks the stop region.`,
      invalidationRule: noSignal ? "A new setup is required after a clean breakout/retest or rejection." : `Invalid if price closes beyond ${round(stop, pricePrecision)} with momentum.`,
      lastUpdated: now()
    };
  }

  async function analyzeCryptoMarket(asset, style, timeframe) {
    const live = await getLiveCryptoPrice(asset);
    return buildMarketResult({
      marketType: "Crypto",
      asset,
      style,
      timeframe,
      basePrice: live.price,
      dataSource: live.source,
      isLivePrice: live.isLivePrice
    });
  }

  function analyzeForexMarket(pair, style) {
    const result = buildMarketResult({ marketType: "Forex", asset: pair, style, timeframe: style === "Long-Term Macro View" ? "1D" : "4H", basePrice: snapshotPrice(pair) });
    return {
      ...result,
      keyLevels: `${result.supportResistance.support} support / ${result.supportResistance.resistance} resistance`,
      sessionBias: pair.includes("JPY") ? "Asia/London overlap is important" : "London and New York sessions carry most liquidity",
      dollarStrengthSummary: pair.startsWith("USD") ? "USD strength supports upside pressure." : "USD strength can pressure the pair lower.",
      newsRisk: "Check central bank, CPI, NFP, PMI, and major session headlines before execution.",
      entryIdea: result.entryZone,
      takeProfits: result.takeProfits.length ? result.takeProfits : [{ label: "TP", price: "Wait", note: "No active target until confirmation." }]
    };
  }

  function analyzeCommodityMarket(asset, style) {
    const result = buildMarketResult({ marketType: "Commodities", asset, style, timeframe: style === "Swing Trading" ? "1D" : "4H", basePrice: snapshotPrice(asset) });
    return {
      ...result,
      volatility: result.riskLevel === "High" ? "Elevated" : "Controlled",
      macroNewsRisk: asset === "XAU/USD" ? "Watch USD, real yields, central bank tone, and geopolitical headlines." : "Watch inventory data, supply headlines, USD, and risk sentiment."
    };
  }

  function analyzeStockMarket(mode, selectedOption) {
    const seed = hashSeed([mode, selectedOption]);
    const riskOn = seed % 2 === 0;
    return {
      marketType: "Stocks",
      mode,
      selectedOption,
      demo: true,
      signalStatus: "Research View",
      confidenceScore: 60 + (seed % 25),
      riskLevel: riskOn ? "Medium" : "High",
      lastUpdated: now(),
      summary: {
        sp500Trend: riskOn ? "Constructive above major moving averages" : "Mixed with resistance near recent highs",
        nasdaqTrend: seed % 3 === 0 ? "Leadership from AI and mega-cap technology" : "Momentum cooling; watch breadth",
        dowTrend: "Stable but less aggressive than growth indices",
        volatility: riskOn ? "Moderate" : "Elevated",
        marketCondition: riskOn ? "Risk-on with selective leadership" : "Risk-off / defensive rotation",
        macroRisk: "Interest rates, inflation data, earnings guidance, and central-bank language remain key placeholders until live data is connected.",
        overall: "Use this as an educational framework until live equity, macro, and earnings APIs are connected."
      },
      strategy: {
        investmentHorizon: mode === "Long-Term Investment Strategy" ? "3-10 years" : "Define based on mode",
        riskProfile: selectedOption,
        suggestedStrategyType: selectedOption.includes("Dividend") ? "Income and quality screen" : selectedOption.includes("Value") ? "Value and margin-of-safety screen" : "Quality growth with staged entries",
        diversification: "Spread exposure across sectors, company sizes, and cash reserves instead of concentrating in one theme.",
        dca: "Dollar-cost averaging reduces timing pressure by splitting entries into planned intervals.",
        riskManagement: "Keep position sizes controlled, review thesis quarterly, and define what would invalidate each holding."
      },
      sectors: [
        ["Technology", "Leadership depends on earnings growth and AI capex durability."],
        ["Energy", "Sensitive to oil, geopolitics, and demand expectations."],
        ["Financials", "Watch rates, credit conditions, and yield curve behavior."],
        ["Healthcare", "Often defensive, but stock selection matters."],
        ["Consumer", "Track employment, wages, and discretionary demand."],
        ["AI-related stocks", "Strong theme, but valuation discipline is critical."],
        ["Defensive stocks", "Useful when volatility rises and risk appetite weakens."]
      ],
      investorStyle: {
        "Warren Buffett style": "Focus on durable moats, cash flow, management quality, and margin of safety.",
        "Peter Lynch style": "Look for understandable companies with growth that the market underestimates.",
        "Ray Dalio style": "Balance assets across growth, inflation, deflation, and policy regimes.",
        "Growth Investing": "Prioritize revenue/earnings expansion and reinvestment runway.",
        "Value Investing": "Seek discounted assets with catalysts and balance-sheet protection.",
        "Dividend Investing": "Focus on sustainable payouts, cash flow, and dividend growth."
      }[selectedOption] || "Use a rules-based research checklist before building positions."
    };
  }

  async function getArbitrageOpportunities(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") params.set(key, value);
    });
    const token = window.localStorage?.getItem("bb_token") || "";
    const response = await fetch(`/api/scanner/opportunities${params.size ? `?${params.toString()}` : ""}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!response.ok) {
      const fallback = `Scanner request failed with status ${response.status}`;
      try {
        const body = await response.json();
        throw new Error(body.error || fallback);
      } catch (error) {
        if (error instanceof Error && error.message !== fallback) throw error;
        throw new Error(fallback);
      }
    }
    return response.json();
  }

  window.BullBearMarketHub = {
    cryptoAssets,
    forexPairs,
    commodityAssets,
    stockModes,
    stockOptions,
    educationLessons,
    analyzeCryptoMarket,
    analyzeForexMarket,
    analyzeCommodityMarket,
    analyzeStockMarket,
    getArbitrageOpportunities
  };
})();
