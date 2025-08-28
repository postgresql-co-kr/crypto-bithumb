
import chalk from "chalk";

// From original index.ts
export interface CoinConfig {
  symbol: string;
  icon: string;
  averagePurchasePrice: number;
  unit_currency: string;
}

export interface AppConfig {
  coins: CoinConfig[];
}

export interface MarketInfo {
  market: string;
  korean_name: string;
  english_name: string;
}

// New standardized data structure for all exchanges
export interface StandardizedTickerData {
  symbol: string;
  koreanName: string;
  icon: string;
  currentPrice: number;
  priceChangeRate: number; // 24h change %
  priceChangeAmount: number; // 24h change absolute
  volumePower?: number; // 체결강도 (optional as not all exchanges provide it)
  highPrice: number;
  lowPrice: number;
  prevClosePrice: number; // 전일 종가
  // For user portfolio calculation
  averagePurchasePrice?: number;
  profitLossRate?: number; // 수익률
  priceColor: (text: string | number) => string; // Color for price based on change
}

// Abstract class for exchanges
export abstract class Exchange {
  abstract readonly name: string;
  protected realTimeData: Map<string, StandardizedTickerData> = new Map();
  protected redrawCallback: () => void;

  constructor(redrawCallback: () => void) {
    this.redrawCallback = redrawCallback;
  }

  abstract connect(appConfig: AppConfig): Promise<void>;
  abstract disconnect(): void;

  public getData(): Map<string, StandardizedTickerData> {
    return this.realTimeData;
  }
}
