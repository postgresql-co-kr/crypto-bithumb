import WebSocket from "ws";
import chalk from "chalk";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import {
  Exchange,
  StandardizedTickerData,
  AppConfig,
  CoinConfig,
} from "../common";

// Upbit specific interfaces
interface UpbitTickerData {
  type: "ticker";
  code: string; // e.g., "KRW-BTC"
  opening_price: number;
  high_price: number;
  low_price: number;
  trade_price: number;
  prev_closing_price: number;
  acc_trade_price_24h: number;
  acc_trade_volume_24h: number;
  acc_trade_price: number;
  acc_trade_volume: number;
  trade_date: string;
  trade_time: string;
  trade_timestamp: number;
  ask_bid: "ASK" | "BID";
  acc_ask_volume: number;
  acc_bid_volume: number;
  highest_52_week_price: number;
  highest_52_week_date: string;
  lowest_52_week_price: number;
  lowest_52_week_date: string;
  market_state: string;
  is_trading_suspended: boolean;
  delisting_date: null | string;
  market_warning: "NONE" | "CAUTION";
  timestamp: number;
  stream_type: "SNAPSHOT" | "REALTIME";
  signed_change_price: number;
  signed_change_rate: number;
  change: "RISE" | "EVEN" | "FALL";
}

interface UpbitMarketInfo {
  market: string;
  korean_name: string;
  english_name: string;
}

export class Upbit extends Exchange {
  readonly name = "Upbit";
  private ws: WebSocket | null = null;
    private isActive: boolean = false;
  private wsUri: string = "wss://api.upbit.com/websocket/v1";
  private marketInfo: Map<string, UpbitMarketInfo> = new Map();
  private iconMap: Map<string, string> = new Map();

  constructor(redrawCallback: () => void) {
    super(redrawCallback);
  }

  private async fetchMarketInfo(): Promise<void> {
    try {
      const response = await axios.get("https://api.upbit.com/v1/market/all");
      if (response.status === 200) {
        const markets: UpbitMarketInfo[] = response.data;
        markets.forEach((market) => {
          if (market.market.startsWith("KRW-")) {
            this.marketInfo.set(market.market, market);
          }
        });
      }
    } catch (error) {
      console.error(chalk.red("Upbit 마켓 정보 로딩 오류:"), error);
    }
  }

  async connect(appConfig: AppConfig): Promise<void> {
    await this.fetchMarketInfo();

    const upbitSymbols = appConfig.coins.map((coin) => {
      const symbol = `${coin.unit_currency}-${coin.symbol}`;
      this.iconMap.set(symbol, coin.icon);
      return symbol;
    });

    if (this.ws) this.disconnect();

    this.ws = new WebSocket(this.wsUri);

    this.ws.on("open", () => {
      console.log(chalk.green("Upbit WebSocket에 연결되었습니다."));
      const subscribeMsg = JSON.stringify([
        { ticket: uuidv4() },
        { type: "ticker", codes: upbitSymbols },
      ]);
      this.ws?.send(subscribeMsg);
    });

    this.ws.on("message", (data: Buffer) => {
      try {
        const message: UpbitTickerData = JSON.parse(data.toString("utf8"));
        if (message.type === "ticker") {
          const coinConfig = appConfig.coins.find(
            (c) => `${c.unit_currency}-${c.symbol}` === message.code
          );
          const standardizedData = this.standardize(message, coinConfig);
          this.realTimeData.set(standardizedData.symbol, standardizedData);
          this.redrawCallback();
        }
      } catch (error) {
        console.error(chalk.red("Upbit 메시지 처리 오류:"), error);
      }
    });

    this.ws.on("error", (error: Error) => {
      console.error(chalk.red("Upbit WebSocket 오류 발생:"), error);
    });

    this.ws.on("close", () => {
      console.log(
        chalk.yellow(
          "Upbit WebSocket 연결이 종료되었습니다. 5초 후 재연결 시도..."
        )
      );
      setTimeout(() => this.connect(appConfig), 5000);
    });
  }

  disconnect(): void {
    this.isActive = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.realTimeData.clear();
    }
  }

  private standardize(
    data: UpbitTickerData,
    coinConfig?: CoinConfig
  ): StandardizedTickerData {
    const symbol = data.code.replace("KRW-", "") + "_KRW";
    const koreanName = this.marketInfo.get(data.code)?.korean_name || symbol;

    let priceColor = chalk.white;
    if (data.change === "RISE") priceColor = chalk.redBright;
    else if (data.change === "FALL") priceColor = chalk.cyanBright;

    let profitLossRate: number | undefined;
    if (coinConfig && coinConfig.averagePurchasePrice > 0) {
      const avgPrice = coinConfig.averagePurchasePrice;
      profitLossRate = ((data.trade_price - avgPrice) / avgPrice) * 100;
    }

    return {
      symbol: symbol,
      koreanName: koreanName,
      icon: this.iconMap.get(data.code) || " ",
      currentPrice: data.trade_price,
      priceChangeRate: data.signed_change_rate * 100,
      priceChangeAmount: data.signed_change_price,
      highPrice: data.high_price,
      lowPrice: data.low_price,
      prevClosePrice: data.prev_closing_price,
      averagePurchasePrice: coinConfig?.averagePurchasePrice,
      profitLossRate: profitLossRate,
      priceColor: priceColor,
      volumePower: undefined, // Upbit ticker does not provide volume power
    };
  }
}
