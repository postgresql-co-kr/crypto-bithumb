import WebSocket from "ws";
import chalk from "chalk";
import Table from "cli-table3";
import * as fs from "fs";

// Interface for coin configuration from config.json
interface CoinConfig {
  symbol: string;
  icon: string;
  averagePurchasePrice: number;
}

// Interface for the overall application configuration
interface AppConfig {
  coins: CoinConfig[];
}

// Define icon map
let iconMap: Record<string, string> = {};

// Interface for the content received from Bithumb WebSocket
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
  lastClosePrice?: string; // Added for dynamic price comparison
}

// Interface for realTimeData object
interface RealTimeData {
  [key: string]: TickerContent;
}

let appConfig: AppConfig;
try {
  const configPath = "./config.json";
  const configContent = fs.readFileSync(configPath, "utf8");
  appConfig = JSON.parse(configContent);
} catch (error) {
  console.error(chalk.red("Error loading config.json:"), error);
  process.exit(1); // Exit if config cannot be loaded
}

// Populate iconMap after appConfig is loaded
appConfig.coins.forEach((coin) => {
  iconMap[coin.symbol] = coin.icon;
});

// 구독할 코인 목록 (예: BTC, ETH, XRP)
const symbols: string[] = appConfig.coins.map((coin) => coin.symbol);

// Bithumb WebSocket URL
const wsUri: string = "wss://pubwss.bithumb.com/pub/ws";

// 실시간 시세 데이터를 저장할 객체
const realTimeData: RealTimeData = {};

// 콘솔을 지우고 테이블을 다시 그리는 함수
function redrawTable(): void {
  // 테이블 생성
  const table = new Table({
    head: [
      chalk.blue("코인"),
      chalk.blue("현재가"),
      chalk.blue("고가(24H)"), // High Price
      chalk.blue("저가(24H)"), // Low Price
      chalk.blue("변동금액(24H)"),
      chalk.blue("변동률(24H)"),
      chalk.blue("수익률"), // Profit/Loss Rate
    ],
    colWidths: [15, 15, 15, 15, 18, 15, 15], // Added width for 수익률
  });

  // 저장된 실시간 데이터로 테이블 채우기
  // 변동률(chgRate)을 기준으로 내림차순 정렬
  const sortedSymbols: string[] = Object.keys(realTimeData).sort(
    (a: string, b: string) => {
      const rateA: number = parseFloat(realTimeData[a].chgRate);
      const rateB: number = parseFloat(realTimeData[b].chgRate);
      return rateB - rateA; // 내림차순 정렬
    }
  );

  for (const symbol of sortedSymbols) {
    // Iterate over sorted symbols
    const data: TickerContent = realTimeData[symbol];
    // console.log(data); // Removed for cleaner output after debugging
    const price: string = parseFloat(data.closePrice).toLocaleString("ko-KR");
    const prevPrice: number = parseFloat(
      data.lastClosePrice || data.prevClosePrice
    ); // Use lastClosePrice for comparison, fallback to prevClosePrice if not available
    const changeRate: number = parseFloat(data.chgRate);
    const changeAmount: number = parseFloat(data.chgAmt);

    let priceColor = chalk.white; // Default color for price
    const currentClosePrice: number = parseFloat(data.closePrice);

    //console.log("=============>", currentClosePrice, prevPrice);
    if (currentClosePrice > prevPrice) {
      priceColor = chalk.red; // Price increased
    } else if (currentClosePrice < prevPrice) {
      priceColor = chalk.blue; // Price decreased
    }

    let rateColor = chalk.white;
    if (changeRate > 0) {
      rateColor = chalk.green; // 상승
    } else if (changeRate < 0) {
      rateColor = chalk.red; // 하락
    }

    const icon: string = iconMap[symbol] || " "; // Get icon, default to space if not found

    const coinConfig = appConfig.coins.find((c) => c.symbol === symbol);
    let profitLossRate: string;
    let profitLossColor = chalk.white;

    if (coinConfig && coinConfig.averagePurchasePrice > 0) {
      const currentPrice = parseFloat(data.closePrice);
      const avgPrice = coinConfig.averagePurchasePrice;
      const rate = ((currentPrice - avgPrice) / avgPrice) * 100;
      profitLossRate = `${rate.toFixed(2)}%`;

      if (rate > 0) {
        profitLossColor = chalk.green;
      } else if (rate < 0) {
        profitLossColor = chalk.red;
      }
    } else {
      // If averagePurchasePrice is 0 or undefined, show change rate
      const changeRateValue = parseFloat(data.chgRate);
      profitLossRate = `${changeRateValue.toFixed(2)}%`;
      if (changeRateValue > 0) {
        profitLossColor = chalk.green;
      } else if (changeRateValue < 0) {
        profitLossColor = chalk.red;
      }
    }

    table.push([
      chalk.yellow(`${icon} ${symbol}`),
      priceColor(`${price} KRW`), // Apply color to price
      parseFloat(data.highPrice).toLocaleString("ko-KR"), // High Price
      parseFloat(data.lowPrice).toLocaleString("ko-KR"), // Low Price
      rateColor(`${changeAmount.toLocaleString("ko-KR")} KRW`),
      rateColor(`${changeRate.toFixed(2)}%`),
      profitLossColor(profitLossRate), // Profit/Loss Rate
    ]);
  }

  // 콘솔 지우고 테이블 출력
  console.clear();
  console.log(chalk.bold("Bithumb 실시간 시세 (Ctrl+C to exit)"));
  console.log(table.toString());
}

function connect(): void {
  const ws: WebSocket = new WebSocket(wsUri);

  ws.on("open", () => {
    console.log(chalk.green("Bithumb WebSocket에 연결되었습니다."));

    // 구독 메시지 전송
    const subscribeMsg = {
      type: "ticker",
      symbols: symbols,
      tickTypes: ["MID"], // 자정 기준 변동률
    };
    ws.send(JSON.stringify(subscribeMsg));
  });

  ws.on("message", (data: WebSocket.RawData) => {
    const message: { type: string; content: TickerContent } = JSON.parse(
      data.toString()
    );

    if (message.type === "ticker" && message.content) {
      const content: TickerContent = message.content;

      // Store the current closePrice as lastClosePrice for the next update
      if (realTimeData[content.symbol]) {
        content.lastClosePrice = realTimeData[content.symbol].closePrice;
      } else {
        // For the first message, set lastClosePrice to current closePrice
        content.lastClosePrice = content.closePrice;
      }

      // 실시간 데이터 업데이트
      realTimeData[content.symbol] = content;
      redrawTable();
    }
  });

  ws.on("error", (error: Error) => {
    console.error(chalk.red("WebSocket 오류 발생:"), error);
  });

  ws.on("close", () => {
    console.log(
      chalk.yellow("WebSocket 연결이 종료되었습니다. 5초 후 재연결합니다.")
    );
    setTimeout(connect, 5000);
  });
}

// 프로그램 시작
connect();
