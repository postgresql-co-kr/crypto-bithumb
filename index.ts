#!/usr/bin/env node
import WebSocket from "ws";
import chalk from "chalk";
import Table from "cli-table3";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import axios from "axios";
import notifier from "node-notifier";
import { exec } from "child_process";

// Function to ensure config file exists
function ensureConfigFile() {
  const homeDir = os.homedir();
  const configDir = path.join(homeDir, ".debate300");
  const configFilePath = path.join(configDir, "config.json");

  // 1. Check if ~/.debate300 directory exists, if not create it.
  if (!fs.existsSync(configDir)) {
    try {
      fs.mkdirSync(configDir, { recursive: true });
    } catch (error) {
      console.error(
        chalk.red(`Error creating config directory at ${configDir}:`),
        error
      );
      process.exit(1);
    }
  }

  // 2. Check if config.json exists in the directory.
  if (!fs.existsSync(configFilePath)) {
    // If not, create it with default content from config.json-top30
    try {
      const defaultConfigPath = path.join(__dirname, "..", "config.json-top30");
      const defaultConfigContent = fs.readFileSync(defaultConfigPath, "utf8");
      fs.writeFileSync(configFilePath, defaultConfigContent, "utf8");
      console.log(
        chalk.green(`Default config file created at ${configFilePath}`)
      );
    } catch (error) {
      console.error(chalk.red(`Error creating default config file:`), error);
      process.exit(1);
    }
  }
}

// Ensure the config file is in place before doing anything else.
ensureConfigFile();

// 커맨드 라인 인수 처리
const args = process.argv.slice(2);
let sortBy = "rate"; // 기본 정렬: 변동률
let displayLimit = 0; // 기본 표시 갯수, 0이면 동적 조절
let limitWasSetByUser = false;

const sortByArgIndex = args.indexOf("--sort-by");
if (sortByArgIndex > -1 && args[sortByArgIndex + 1]) {
  const sortArg = args[sortByArgIndex + 1];
  // 허용된 정렬 옵션인지 확인
  if (["name", "rate"].includes(sortArg)) {
    sortBy = sortArg;
  } else {
    console.log(
      chalk.yellow(
        `Warning: Invalid sort option '${sortArg}'. Defaulting to 'rate'.`
      )
    );
  }
}

const limitArgIndex = args.indexOf("--limit");
if (limitArgIndex > -1 && args[limitArgIndex + 1]) {
  const limitArg = parseInt(args[limitArgIndex + 1], 10);
  if (!isNaN(limitArg) && limitArg > 0) {
    displayLimit = limitArg;
    limitWasSetByUser = true;
  } else {
    console.log(
      chalk.yellow(
        `Warning: Invalid limit option '${
          args[limitArgIndex + 1]
        }'. Using dynamic limit.`
      )
    );
  }
}

// Interface for coin configuration from config.json
interface CoinConfig {
  symbol: string;
  icon: string;
  averagePurchasePrice: number;
  unit_currency: string;
}

// Interface for the overall application configuration
interface AppConfig {
  coins: CoinConfig[];
}

// Define icon map
let iconMap: Record<string, string> = {};

// Interface for market data
interface MarketInfo {
  market: string;
  korean_name: string;
  english_name: string;
}
let marketInfo: Record<string, MarketInfo> = {};

// Interface for the content received from Bithumb WebSocket
interface TickerContent {
  volumePower: string; // 체결강도(매수/매도 비율 지표, 100↑이면 매수 우위 경향)
  chgAmt: string; // 변동금액(기준 시점 대비 가격 변화 절대값)
  chgRate: string; // 변동률(기준 시점 대비 % 변화)
  prevClosePrice: string; // 전일 종가
  buyVolume: string; // 누적 매수 체결량
  sellVolume: string; // 누적 매도 체결량
  volume: string; // 누적 거래량(코인 수량)
  value: string; // 누적 거래금액(원화 등 표시통화 합계)
  highPrice: string; // 고가
  lowPrice: string; // 저가
  closePrice: string; // 종가(현재가)
  openPrice: string; // 시가
  time: string; // 시간(HHMMSS, 예: "174044")
  date: string; // 일자(YYYYMMDD, 예: "20211204")
  tickType: string; // 변동 기준 구간: "30M" | "1H" | "12H" | "24H" | "MID"
  symbol: string; // 종목 심볼(예: "BTC_KRW")
  lastClosePrice?: string; // (사용자 추가) 직전 종가 비교용 등 내부 계산 편의 필드
}

// Interface for realTimeData object
interface RealTimeData {
  [key: string]: TickerContent;
}

let appConfig: AppConfig;

function loadConfig(): AppConfig {
  const currentDirConfigPath = path.join(process.cwd(), "config.json");
  const homeDirConfigPath = path.join(
    os.homedir(),
    ".debate300",
    "config.json"
  );

  let configContent: string | undefined;
  let configPathUsed: string | undefined;

  if (fs.existsSync(currentDirConfigPath)) {
    configContent = fs.readFileSync(currentDirConfigPath, "utf8");
    configPathUsed = currentDirConfigPath;
  } else if (fs.existsSync(homeDirConfigPath)) {
    configContent = fs.readFileSync(homeDirConfigPath, "utf8");
    configPathUsed = homeDirConfigPath;
  } else {
    console.error(chalk.red("오류: 'config.json' 파일을 찾을 수 없습니다."));
    console.error(chalk.yellow("다음 위치에서 파일을 확인했습니다:"));
    console.error(chalk.yellow(`  - 현재 디렉토리: ${currentDirConfigPath}`));
    console.error(chalk.yellow(`  - 홈 디렉토리: ${homeDirConfigPath}`));
    console.error(
      chalk.yellow(
        "debate300을 실행하려면 위 경로 중 한 곳에 'config.json' 파일을 생성해야 합니다."
      )
    );
    process.exit(1);
  }

  try {
    return JSON.parse(configContent);
  } catch (error) {
    console.error(
      chalk.red(
        `오류: '${configPathUsed}' 파일의 형식이 올바르지 않습니다. JSON 파싱 오류:`
      ),
      error
    );
    process.exit(1);
  }
}

appConfig = loadConfig();

// Populate iconMap after appConfig is loaded
appConfig.coins.forEach((coin) => {
  iconMap[`${coin.symbol}_${coin.unit_currency}`] = coin.icon;
});

// 구독할 코인 목록 (예: BTC_KRW, ETH_KRW)
const symbols: string[] = appConfig.coins.map(
  (coin) => `${coin.symbol}_${coin.unit_currency}`
);

// Function to fetch market names from Bithumb API
async function fetchMarketInfo(): Promise<void> {
  try {
    const response = await axios.get(
      "https://api.bithumb.com/v1/market/all?isDetails=false"
    );
    if (response.status === 200) {
      const markets: any[] = response.data;
      markets.forEach((market: any) => {
        if (market.market.startsWith("KRW-")) {
          const symbol = `${market.market.replace("KRW-", "")}_KRW`;
          marketInfo[symbol] = {
            market: market.market,
            korean_name: market.korean_name,
            english_name: market.english_name,
          };
        }
      });
    }
  } catch (error) {
    // console.error(chalk.red("한글 코인 이름 로딩 오류:"), error);
  }
}

// Bithumb WebSocket URL
const wsUri: string = "wss://pubwss.bithumb.com/pub/ws";

// 실시간 시세 데이터를 저장할 객체
const realTimeData: RealTimeData = {};
let redrawTimeout: NodeJS.Timeout | null = null;
const lastNotificationLevels: { [symbol: string]: { positive: number; negative: number } } = {};

// 콘솔을 지우고 테이블을 다시 그리는 함수
function redrawTable(): void {
  // Handle dynamic display limit
  let currentDisplayLimit = displayLimit;
  if (!limitWasSetByUser) {
    const terminalHeight = process.stdout.rows || 30;
    // Reserve ~8 lines for header, footer, and other info
    const availableRows = terminalHeight - 8;
    currentDisplayLimit = Math.max(1, availableRows);
  }

  const terminalWidth = process.stdout.columns ? process.stdout.columns : 150;
  // 전체 너비에서 컬럼 구분선 너비(컬럼수 + 1)와 약간의 여백을 뺍니다.
  const availableWidth = terminalWidth - (9 + 1) - 10;

  const colWidths = [
    Math.max(18, Math.floor(availableWidth * 0.18)), // 코인 (이름이 길 수 있으므로)
    Math.max(15, Math.floor(availableWidth * 0.12)), // 현재가
    Math.max(10, Math.floor(availableWidth * 0.08)),  // 체결강도
    Math.max(10, Math.floor(availableWidth * 0.08)),  // 수익률
    Math.max(12, Math.floor(availableWidth * 0.09)), // 전일대비
    Math.max(15, Math.floor(availableWidth * 0.11)), // 전일대비금액
    Math.max(15, Math.floor(availableWidth * 0.11)), // 전일종가
    Math.max(18, Math.floor(availableWidth * 0.12)), // 고가 (내용이 길어짐)
    Math.max(18, Math.floor(availableWidth * 0.11)), // 저가 (내용이 길어짐)
  ];

  // 테이블 생성
  const table = new Table({
    head: [
      chalk.magentaBright("코인"),
      chalk.magentaBright("현재가"),
      chalk.magentaBright("체결강도"), // volumePower
      chalk.magentaBright("수익률"), // Profit/Loss Rate
      chalk.magentaBright("전일대비"),
      chalk.magentaBright("전일대비금액"),
      chalk.magentaBright("전일종가"),
      chalk.magentaBright("고가"), // High Price
      chalk.magentaBright("저가"), // Low Price
    ],
    colWidths: colWidths,
    wordWrap: true,
  });

  // 저장된 실시간 데이터로 테이블 채우기
  // --sort-by 인수에 따라 정렬. 기본은 변동률순.
  const sortedSymbols: string[] = Object.keys(realTimeData).sort(
    (a: string, b: string) => {
      if (sortBy === "name") {
        return a.localeCompare(b); // 이름순
      }
      // 기본 정렬: 변동률 기준 내림차순
      const rateA: number = parseFloat(realTimeData[a].chgRate);
      const rateB: number = parseFloat(realTimeData[b].chgRate);
      return rateB - rateA;
    }
  );

  const displaySymbols = 
    sortedSymbols.length > currentDisplayLimit
      ? sortedSymbols.slice(0, currentDisplayLimit)
      : sortedSymbols;

  for (const symbol of displaySymbols) {
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
      priceColor = chalk.redBright; // Price increased
    } else if (currentClosePrice < prevPrice) {
      priceColor = chalk.cyanBright; // Price decreased
    }

    let rateColor = chalk.white;
    if (changeRate > 0) {
      rateColor = chalk.green; // 상승
    } else if (changeRate < 0) {
      rateColor = chalk.red; // 하락
    }

    const icon: string = iconMap[symbol] || " "; // Get icon, default to space if not found
    const koreanName = marketInfo[symbol]?.korean_name;
    const displayName = koreanName
      ? `${symbol.replace("_KRW", "")} ${koreanName}`
      : symbol;

    const coinConfig = appConfig.coins.find(
      (c) => `${c.symbol}_${c.unit_currency}` === symbol
    );
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
      profitLossRate = `-`;
      if (changeRateValue > 0) {
        profitLossColor = chalk.green;
      } else if (changeRateValue < 0) {
        profitLossColor = chalk.red;
      }
    }

    const prevClosePriceNum = parseFloat(data.prevClosePrice);
    const highPriceNum = parseFloat(data.highPrice);
    const lowPriceNum = parseFloat(data.lowPrice);

    const highPricePercent = 
      prevClosePriceNum > 0
        ? ((highPriceNum - prevClosePriceNum) / prevClosePriceNum) * 100
        : 0;
    const lowPricePercent = 
      prevClosePriceNum > 0
        ? ((lowPriceNum - prevClosePriceNum) / prevClosePriceNum) * 100
        : 0;

    const highPriceDisplay = `${ 
      highPricePercent >= 0
        ? chalk.green(`+${highPricePercent.toFixed(2)}%`)
        : chalk.red(`${highPricePercent.toFixed(2)}%`)
    } (${highPriceNum.toLocaleString("ko-KR")})`;
    const lowPriceDisplay = `${ 
      lowPricePercent >= 0
        ? chalk.green(`+${lowPricePercent.toFixed(2)}%`)
        : chalk.red(`${lowPricePercent.toFixed(2)}%`)
    } (${lowPriceNum.toLocaleString("ko-KR")})`;

    table.push([
      chalk.yellow(`${icon} ${displayName}`),
      priceColor(`${price} KRW`),
      parseFloat(data.volumePower).toFixed(2),
      profitLossColor(profitLossRate), // Profit/Loss Rate
      rateColor(`${changeRate.toFixed(2)}%`),
      rateColor(`${changeAmount.toLocaleString("ko-KR")} KRW`),
      prevClosePriceNum.toLocaleString("ko-KR"),
      highPriceDisplay,
      lowPriceDisplay,
    ]);
  }

  // Calculate overall market sentiment
  let totalWeightedChange = 0;
  let totalVolume = 0;

  for (const symbol of Object.keys(realTimeData)) {
    const data = realTimeData[symbol];
    const chgRate = parseFloat(data.chgRate);
    const tradeValue = parseFloat(data.value); // Using trade value as weight

    if (!isNaN(chgRate) && !isNaN(tradeValue) && tradeValue > 0) {
      totalWeightedChange += chgRate * tradeValue;
      totalVolume += tradeValue; // totalVolume 대신 totalValue로 변경
    }
  }

  let marketSentiment = "";
  let sentimentColor = chalk.white;

  if (totalVolume > 0) {
    const averageChange = totalWeightedChange / totalVolume;
    if (averageChange > 0.5) {
      // Threshold for significant upward trend
      marketSentiment = "전체 시장: 강한 상승세 🚀";
      sentimentColor = chalk.green;
    } else if (averageChange > 0) {
      marketSentiment = "전체 시장: 상승세 📈";
      sentimentColor = chalk.green;
    } else if (averageChange < -0.5) {
      // Threshold for significant downward trend
      marketSentiment = "전체 시장: 강한 하락세 🙇";
      sentimentColor = chalk.red;
    } else if (averageChange < 0) {
      marketSentiment = "전체 시장: 하락세 📉";
      sentimentColor = chalk.red;
    } else {
      marketSentiment = "전체 시장: 보합세 ↔️";
      sentimentColor = chalk.white;
    }
    const volumePowers = Object.values(realTimeData)
      .map((data) => parseFloat(data.volumePower))
      .filter((vp) => !isNaN(vp));
    const averageVolumePower = 
      volumePowers.length > 0
        ? volumePowers.reduce((sum, vp) => sum + vp, 0) / volumePowers.length
        : 0;
    marketSentiment += ` | 체결강도: ${averageVolumePower.toFixed(2)}`;
  } else {
    marketSentiment = "전체 시장: 데이터 부족";
    sentimentColor = chalk.gray;
  }

  // 화면 출력을 위한 버퍼 생성
  const output: string[] = [];
  output.push(
    chalk.bold("Bithumb 실시간 시세 (Ctrl+C to exit) - Debate300.com")
  );
  output.push(sentimentColor(marketSentiment)); // Display market sentiment
  output.push(table.toString());

  if (sortedSymbols.length > currentDisplayLimit) {
    output.push(
      chalk.yellow(
        `참고: 시세 표시가 ${currentDisplayLimit}개로 제한되었습니다. (총 ${sortedSymbols.length}개)`
      )
    );
  }

  // 콘솔을 지우고 한 번에 출력하여 깜빡임 최소화
  process.stdout.write("\x1B[H\x1B[J" + output.join("\n"));
}

function sendNotification(title: string, message: string) {
  if (os.platform() === 'darwin') {
    const escapedTitle = title.replace(/"/g, '"');
    const escapedMessage = message.replace(/"/g, '"');
    const command = `osascript -e 'display notification "${escapedMessage}" with title "${escapedTitle}" sound name "Ping"'`;
    exec(command, (error) => {
      if (error) {
        console.error(`[Notification Error] Failed to execute osascript. Please ensure you are on macOS and that your terminal has notification permissions.`);
        console.error(`[Notification Error] Details: ${error.message}`);
      }
    });
  } else {
    // Fallback to node-notifier for other platforms
    notifier.notify({
      title: title,
      message: message,
      sound: true,
      wait: false
    });
  }
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

      // Notification logic
      const changeRate = parseFloat(content.chgRate);
      const symbol = content.symbol;

      if (!lastNotificationLevels[symbol]) {
        lastNotificationLevels[symbol] = { positive: 0, negative: 0 };
      }

      const currentLevel = Math.floor(Math.abs(changeRate) / 5);

      if (changeRate > 0) {
        if (currentLevel > lastNotificationLevels[symbol].positive) {
          const koreanName = marketInfo[symbol]?.korean_name || symbol;
          const price = parseFloat(content.closePrice).toLocaleString("ko-KR");
          const notificationLevel = currentLevel * 5;

          const title = `코인 가격 상승 알림`;
          const message = `${koreanName}이(가) ${notificationLevel}% 이상 상승했습니다. 현재가: ${price} KRW (${changeRate.toFixed(2)}%)`;
          sendNotification(title, message);

          lastNotificationLevels[symbol].positive = currentLevel;
          lastNotificationLevels[symbol].negative = 0; // Reset negative level on positive change
        }
      } else if (changeRate < 0) {
        if (currentLevel > lastNotificationLevels[symbol].negative) {
          const koreanName = marketInfo[symbol]?.korean_name || symbol;
          const price = parseFloat(content.closePrice).toLocaleString("ko-KR");
          const notificationLevel = currentLevel * 5;

          const title = `코인 가격 하락 알림`;
          const message = `${koreanName}이(가) ${notificationLevel}% 이상 하락했습니다. 현재가: ${price} KRW (${changeRate.toFixed(2)}%)`;
          sendNotification(title, message);

          lastNotificationLevels[symbol].negative = currentLevel;
          lastNotificationLevels[symbol].positive = 0; // Reset positive level on negative change
        }
      }

      // 깜빡임 감소를 위해 redrawTable 호출을 디바운스합니다.
      if (!redrawTimeout) {
        redrawTimeout = setTimeout(() => {
          redrawTable();
          redrawTimeout = null;
        }, 100); // 100ms 간격으로 다시 그립니다.
      }
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

async function start() {
  await fetchMarketInfo();
  connect();
}

// 프로그램 시작
start();

// Listen for terminal resize events to make the table responsive
process.stdout.on('resize', () => {
  if (!redrawTimeout) {
    // Debounce redraw to avoid excessive calls
    redrawTimeout = setTimeout(() => {
      redrawTable();
      redrawTimeout = null;
    }, 100);
  }
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log(chalk.blue("\n프로그램을 종료합니다."));
  process.exit(0);
});