import WebSocket from "ws";
import chalk from "chalk";
import axios from "axios";
import {
  Exchange,
  StandardizedTickerData,
  AppConfig,
  MarketInfo,
  CoinConfig,
} from "../common";

// Bithumb specific interfaces
interface TickerContent {
  volumePower: string;
  chgAmt: string;
  chgRate: string;
  prevClosePrice: string;
  buyVolume: string;
  sellVolume: string;
  volume: string;
  value: string;
  highPrice: string;
  lowPrice: string;
  closePrice: string;
  openPrice: string;
  time: string;
  date: string;
  tickType: string;
  symbol: string;
  lastClosePrice?: string;
}

export class Bithumb extends Exchange {
  readonly name = "Bithumb";
  private ws: WebSocket | null = null;
  private isActive: boolean = false;
  private wsUri: string = "wss://pubwss.bithumb.com/pub/ws";
  private marketInfo: Record<string, MarketInfo> = {};
  private iconMap: Record<string, string> = {};
  private lastClosePrices: Record<string, string> = {};

  constructor(redrawCallback: () => void) {
    super(redrawCallback);
  }

  async connect(appConfig: AppConfig): Promise<void> {
    this.isActive = true;
    await this.fetchMarketInfo();
    appConfig.coins.forEach((coin) => {
      this.iconMap[`${coin.symbol}_${coin.unit_currency}`] = coin.icon;
    });

    const symbols: string[] = appConfig.coins.map(
      (coin) => `${coin.symbol}_${coin.unit_currency}`
    );

    this.ws = new WebSocket(this.wsUri);

    this.ws.on("open", () => {
      const subscribeMsg = {
        type: "ticker",
        symbols: symbols,
        tickTypes: ["MID"],
      };
      this.ws?.send(JSON.stringify(subscribeMsg));
    });

    this.ws.on("message", (data: WebSocket.RawData) => {
      this.handleMessage(data, appConfig);
    });

    this.ws.on("error", (error: Error) => {
      console.error(chalk.red("Bithumb WebSocket 오류 발생:"), error);
    });

    this.ws.on("close", () => {
      if (!this.isActive) {
        console.log(
          chalk.gray(`${this.name} WebSocket 연결이 정상적으로 종료되었습니다.`)
        );
        return;
      }
      console.log(
        chalk.yellow(
          `${this.name} WebSocket 연결이 끊어졌습니다. 5초 후 재연결합니다.`
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
      console.log(chalk.yellow("Bithumb 연결이 해제되었습니다."));
    }
  }

  private handleMessage(data: WebSocket.RawData, appConfig: AppConfig): void {
    const message: { type: string; content: TickerContent } = JSON.parse(
      data.toString()
    );

    if (message.type === "ticker" && message.content) {
      const content = message.content;
      const standardizedData = this.standardize(content, appConfig);
      this.realTimeData.set(content.symbol, standardizedData);
      this.redrawCallback();
    }
  }

  private standardize(
    data: TickerContent,
    appConfig: AppConfig
  ): StandardizedTickerData {
    const symbol = data.symbol;
    const currentPrice = parseFloat(data.closePrice);
    const prevComparisonPrice = parseFloat(
      this.lastClosePrices[symbol] || data.prevClosePrice
    );
    this.lastClosePrices[symbol] = data.closePrice;

    let priceColor = chalk.white;
    if (currentPrice > prevComparisonPrice) priceColor = chalk.redBright;
    else if (currentPrice < prevComparisonPrice) priceColor = chalk.cyanBright;

    const coinConfig = appConfig.coins.find(
      (c) => `${c.symbol}_${c.unit_currency}` === symbol
    );
    let profitLossRate: number | undefined;
    if (coinConfig && coinConfig.averagePurchasePrice > 0) {
      const avgPrice = coinConfig.averagePurchasePrice;
      profitLossRate = ((currentPrice - avgPrice) / avgPrice) * 100;
    }

    return {
      symbol: symbol,
      koreanName:
        this.marketInfo[symbol]?.korean_name || symbol.replace("_KRW", ""),
      icon: this.iconMap[symbol] || " ",
      currentPrice: currentPrice,
      priceChangeRate: parseFloat(data.chgRate),
      priceChangeAmount: parseFloat(data.chgAmt),
      volumePower: parseFloat(data.volumePower),
      highPrice: parseFloat(data.highPrice),
      lowPrice: parseFloat(data.lowPrice),
      prevClosePrice: parseFloat(data.prevClosePrice),
      averagePurchasePrice: coinConfig?.averagePurchasePrice,
      profitLossRate: profitLossRate,
      priceColor: priceColor,
    };
  }

  private async fetchMarketInfo(): Promise<void> {
    try {
      const response = await axios.get(
        "https://api.bithumb.com/v1/market/all?isDetails=false"
      );
      if (response.status === 200) {
        const markets: any[] = response.data;
        markets.forEach((market: any) => {
          if (market.market.startsWith("KRW-")) {
            const symbol = `${market.market.replace("KRW-", "")}_KRW`;
            this.marketInfo[symbol] = {
              market: market.market,
              korean_name: market.korean_name,
              english_name: market.english_name,
            };
          }
        });
      }
    } catch (error) {
      console.error(chalk.red("Bithumb 한글 코인 이름 로딩 오류:"), error);
    }
  }
}
