export type MarketType = "Crypto" | "Forex" | "Commodities" | "Stocks" | "Arbitrage";

export type TradingStyle =
  | "Scalping"
  | "Day Trading"
  | "Swing Trading"
  | "Long-Term Investment"
  | "Long-Term Macro View";

export type Timeframe = "5m" | "15m" | "1H" | "4H" | "1D" | "1W";

export type SignalStatus = "Long" | "Short" | "No High-Quality Setup" | "Research View";

export type RiskLevel = "Low" | "Medium" | "High";

export interface Asset {
  symbol: string;
  name: string;
  marketType: MarketType;
}

export interface TakeProfitLevel {
  label: "TP1" | "TP2" | "TP3" | "TP";
  price: number | string;
  note: string;
}

export interface AnalyzerResult {
  marketType: MarketType;
  asset?: string;
  style?: TradingStyle | string;
  timeframe?: Timeframe | string;
  demo: boolean;
  currentPrice?: number | string;
  dataSource?: string;
  isLivePrice?: boolean;
  signalStatus: SignalStatus;
  bias?: string;
  entryZone?: string;
  stopLoss?: number | string;
  takeProfits?: TakeProfitLevel[];
  riskRewardRatio?: string;
  confidenceScore: number;
  trend?: string;
  supportResistance?: {
    support: number | string;
    resistance: number | string;
  };
  liquidityZones?: string[];
  volumeSummary?: string;
  indicatorSummary?: {
    rsi: string;
    macd: string;
    ema: string;
  };
  riskLevel: RiskLevel;
  explanation?: string;
  invalidationRule?: string;
  lastUpdated: string;
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
  analyzeCryptoMarket(asset: string, style: TradingStyle, timeframe: Timeframe): AnalyzerResult | Promise<AnalyzerResult>;
  analyzeForexMarket(pair: string, style: TradingStyle): AnalyzerResult;
  analyzeCommodityMarket(asset: string, style: TradingStyle): AnalyzerResult;
  analyzeStockMarket(mode: string, selectedOption: string): AnalyzerResult;
  getArbitrageOpportunities(filters?: Record<string, string | number | boolean | null | undefined>): Promise<unknown>;
}
