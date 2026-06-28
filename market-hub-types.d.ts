export type Market = "crypto" | "forex" | "gold" | "stocks" | "commodities";

export type AnalyzerMode =
  | "scalping"
  | "dayTrading"
  | "swingTrading"
  | "longTermInvestment"
  | "marketSummary"
  | "sectorAnalysis";

export type AnalyzerTimeframe = "5m" | "15m" | "1h" | "4h" | "1d" | "1w";

export type SignalStatus = "long" | "short" | "neutral" | "noSignal" | "highRisk";

export type RiskLevel = "low" | "medium" | "high" | "extreme";

export interface AnalyzerRequest {
  market: Market;
  asset?: string;
  mode: AnalyzerMode;
  timeframe: AnalyzerTimeframe;
}

export interface EntryZone {
  low: number;
  high: number;
}

export interface TakeProfitLevel {
  level: "TP1" | "TP2" | "TP3";
  price: number;
  riskMultiple: number;
}

export interface ConfluenceComponent {
  score: number;
  detail: string;
}

export interface StrategyBreakdown {
  setupQuality: string;
  components: {
    trend: ConfluenceComponent;
    marketStructure: ConfluenceComponent;
    supportResistance: ConfluenceComponent;
    liquidity: ConfluenceComponent;
    momentum: ConfluenceComponent;
    volume: ConfluenceComponent;
    volatility: ConfluenceComponent;
    newsRisk: ConfluenceComponent;
    riskReward: ConfluenceComponent;
    marketSpecific: ConfluenceComponent;
  };
  strategies: string[];
  technicalSnapshot?: Record<string, string | number>;
  research?: Record<string, unknown>;
  notes?: string[];
}

export interface AnalyzerDataStatus {
  status: "demo" | "fallback-demo" | "live" | "delayed";
  provider: string;
  message: string;
}

export interface AnalyzerMarketDataMetadata {
  attempted: boolean;
  available: boolean;
  fallbackUsed: boolean;
  reasonCode?: string;
}

export interface AnalyzerMetadata {
  educationalDisclaimer: string;
  executionEnabled: false;
  orderPlacementSupported: false;
  modelVersion: "market-hub-analyzer-v2";
  marketData: AnalyzerMarketDataMetadata;
}

export interface AnalyzerResult {
  market: Market;
  asset: string;
  mode: AnalyzerMode;
  timeframe: AnalyzerTimeframe;
  signalStatus: SignalStatus;
  confidenceScore: number;
  riskLevel: RiskLevel;
  marketBias: string;
  entryZone: EntryZone | null;
  stopLoss: number | null;
  takeProfits: TakeProfitLevel[];
  riskReward: number | null;
  strategyBreakdown: StrategyBreakdown;
  explanation: string;
  invalidationRule: string;
  noSignalReason: string | null;
  highRiskWarning: string | null;
  dataStatus: AnalyzerDataStatus;
  dataSource: string;
  isDemo: boolean;
  lastUpdated: string;
  metadata: AnalyzerMetadata;
}

// Existing browser analyzer contract retained until the frontend migrates to V2.
export type LegacyMarketType = "Crypto" | "Forex" | "Commodities" | "Stocks" | "Arbitrage";
export type LegacyTradingStyle = "Scalping" | "Day Trading" | "Swing Trading" | "Long-Term Investment" | "Long-Term Macro View";
export type LegacyTimeframe = "5m" | "15m" | "1H" | "4H" | "1D" | "1W";

export interface LegacyAnalyzerResult {
  marketType: LegacyMarketType;
  asset?: string;
  style?: LegacyTradingStyle | string;
  timeframe?: LegacyTimeframe | string;
  demo: boolean;
  signalStatus: "Long" | "Short" | "No High-Quality Setup" | "Research View";
  confidenceScore: number;
  riskLevel: "Low" | "Medium" | "High";
  lastUpdated: string;
  [key: string]: unknown;
}

export interface EducationLesson {
  id: string;
  title: string;
  summary: string;
  whenToUse: string;
  risks: string;
  analyzerUse: string;
  mistakes: string[];
}

export interface MarketHubService {
  analyzeCryptoMarket(asset: string, style: LegacyTradingStyle, timeframe: LegacyTimeframe): LegacyAnalyzerResult | Promise<LegacyAnalyzerResult>;
  analyzeForexMarket(pair: string, style: LegacyTradingStyle): LegacyAnalyzerResult;
  analyzeCommodityMarket(asset: string, style: LegacyTradingStyle): LegacyAnalyzerResult;
  analyzeStockMarket(mode: string, selectedOption: string): LegacyAnalyzerResult;
  getArbitrageOpportunities(filters?: Record<string, string | number | boolean | null | undefined>): Promise<unknown>;
}
