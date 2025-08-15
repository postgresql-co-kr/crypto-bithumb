import WebSocket from "ws";
import chalk from "chalk";
import Table from "cli-table3";
import * as fs from "fs";
import axios from "axios";
import * as crypto from "crypto"; // For HMAC-SHA512 signing
import * as jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";

// 커맨드 라인 인수 처리
const args = process.argv.slice(2);
let sortBy = 'rate'; // 기본 정렬: 변동률
const sortByArgIndex = args.indexOf('--sort-by');
if (sortByArgIndex > -1 && args[sortByArgIndex + 1]) {
    const sortArg = args[sortByArgIndex + 1];
    // 허용된 정렬 옵션인지 확인
    if (['name', 'rate'].includes(sortArg)) {
        sortBy = sortArg;
    } else {
        console.log(chalk.yellow(`Warning: Invalid sort option '${sortArg}'. Defaulting to 'rate'.`));
    }
}

// Interface for coin configuration from config.json
interface CoinConfig {
  symbol: string;
  icon: string;
  averagePurchasePrice: number;
  balance?: number; // 추가
  locked?: number; // 추가
  unit_currency?: string; // 추가
}

// Interface for the overall application configuration
interface AppConfig {
  coins: CoinConfig[];
}

// Interface for API configuration from api_keys.json
interface ApiConfig {
  bithumb_api_key: string;
  bithumb_secret_key: string;
}

// Define icon map
let iconMap: Record<string, string> = {};

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

interface Accounts {
    currency: string,  // symbol
    balance: string, // 보유 수량
    locked: string, // 매도 수량
    avg_buy_price: string, // 령균 매수가
    avg_buy_price_modified: boolean,
    unit_currency: string // KRW, BTC
}

// Interface for realTimeData object
interface RealTimeData {
  [key: string]: TickerContent;
}

let appConfig: AppConfig;
let apiConfig: ApiConfig | null = null; // Initialize apiConfig as nullable

try {
  const configPath = "./config.json";
  const configContent = fs.readFileSync(configPath, "utf8");
  appConfig = JSON.parse(configContent);
} catch (error) {
  console.error(chalk.red("Error loading config.json:"), error);
  process.exit(1); // Exit if config cannot be loaded
}

// Try to load API keys
try {
  const apiConfigPath = "./api_keys.json";
  const apiConfigContent = fs.readFileSync(apiConfigPath, "utf8");
  apiConfig = JSON.parse(apiConfigContent);
  if (!apiConfig?.bithumb_api_key || !apiConfig?.bithumb_secret_key) {
    console.warn(chalk.yellow("Warning: api_keys.json contains placeholder API keys. Please update them for API functionality."));
    apiConfig = null; // Treat as no API keys if placeholders are present
  } else {
    console.log(chalk.green("API keys loaded successfully. Attempting to fetch user holdings from Bithumb API."));
  }
} catch (error) {
  console.log(chalk.yellow("api_keys.json not found or could not be loaded. Proceeding with config.json only."));
  apiConfig = null;
}

// Populate iconMap after appConfig is loaded
appConfig.coins.forEach((coin) => {
  iconMap[coin.symbol + "_" + (coin.unit_currency || "KRW")] = coin.icon; // unit_currency 추가
});

// 구독할 코인 목록 (예: BTC, ETH, XRP)
let symbols: string[] = appConfig.coins.map((coin) => coin.symbol + "_" + (coin.unit_currency || "KRW")); // unit_currency 추가

// Bithumb API Base URL (for v1 API)
const BITHUMB_API_BASE_URL = "https://api.bithumb.com";

// Function to fetch user holdings from Bithumb API
async function fetchUserHoldings(): Promise<CoinConfig[]> {
  if (!apiConfig) {
    console.log(chalk.yellow("API keys not available. Cannot fetch user holdings."));
    return [];
  }

  const currentApiConfig: ApiConfig = apiConfig;

  if (!currentApiConfig.bithumb_api_key || !currentApiConfig.bithumb_secret_key) {
    console.log(chalk.yellow("Bithumb API key or secret is missing. Cannot fetch user holdings.\n"));
    return [];
  }

  const endpoint = "/v1/accounts"; // 계좌 정보 엔드포인트
  const fullUrl = `${BITHUMB_API_BASE_URL}${endpoint}`;

  // JWT 토큰 생성
  const payload = {
    access_key: currentApiConfig.bithumb_api_key,
    nonce: uuidv4(),
    timestamp: Date.now()
  };
  const jwtToken = jwt.sign(payload, currentApiConfig.bithumb_secret_key);

  try {
    const response = await axios.get(fullUrl, { // GET 요청으로 변경
      headers: {
        Authorization: `Bearer ${jwtToken}`
      },
    });

    if (response.status === 200) { // status 확인 조건 추가
      const data = response.data; // response.data.data 사용
      const userHoldings: CoinConfig[] = [];

      // 응답 구조에 따라 데이터 처리
      data.forEach((item: Accounts) => {
        const currency = item.currency;
        const balance = parseFloat(item.balance);
        const locked = parseFloat(item.locked);
        const avg_buy_price = parseFloat(item.avg_buy_price);
        const unit_currency = item.unit_currency || "KRW"; // unit_currency 추가

        // avg_buy_price 값이 0보다 큰 경우에만 추가
        if (avg_buy_price > 0) {
          userHoldings.push({
            symbol: currency,
            icon: iconMap[currency + "_" + unit_currency] || " ", // unit_currency 추가
            averagePurchasePrice: avg_buy_price,
            balance: balance,
            locked: locked,
            unit_currency: unit_currency // unit_currency 추가
          });
        }
      });

      console.log(chalk.green("Successfully fetched user holdings from Bithumb API."));
      return userHoldings;
    } else {
      console.error(chalk.red(`Bithumb API Error: ${response.data.message}`));
      return [];
    }

  } catch (error) {
    console.error(chalk.red("Error fetching user holdings from Bithumb API:"), error);
    return [];
  }
}

// Modify appConfig and symbols based on API data if available
async function initializeAppConfig() {
  if (apiConfig) {
    const userHoldings = await fetchUserHoldings();
    if (userHoldings.length > 0) {
      // Merge API data with existing config.json data, prioritizing API data
      const mergedCoins: CoinConfig[] = [];
      const apiSymbols = new Set(userHoldings.map(h => h.symbol + "_" + (h.unit_currency || "KRW"))); // unit_currency 추가

      // Add coins from API data
      userHoldings.forEach(apiCoin => {
        mergedCoins.push(apiCoin);
      });

      // Add coins from config.json that are not in API data, or update icons
      appConfig.coins.forEach(configCoin => {
        if (!apiSymbols.has(configCoin.symbol + "_" + (configCoin.unit_currency || "KRW"))) { // unit_currency 추가
          mergedCoins.push(configCoin);
        } else {
          // If coin exists in API data, update its icon from config.json
          const existingCoin = mergedCoins.find(mc => mc.symbol === configCoin.symbol && mc.unit_currency === configCoin.unit_currency); // unit_currency 추가
          if (existingCoin) {
            existingCoin.icon = configCoin.icon;
          }
        }
      });
      appConfig.coins = mergedCoins;
      symbols = appConfig.coins.map(coin => coin.symbol + "_" + (coin.unit_currency || "KRW")); // unit_currency 추가
      console.log(chalk.green("App configuration updated with user holdings from Bithumb API."));
    }
  }
}

// Bithumb WebSocket URL
const wsUri: string = "wss://pubwss.bithumb.com/pub/ws";

// 실시간 시세 데이터를 저장할 객체
const realTimeData: RealTimeData = {};
let redrawTimeout: NodeJS.Timeout | null = null;

// 콘솔을 지우고 테이블을 다시 그리는 함수
function redrawTable(): void {
  // 테이블 생성
  const table = new Table({
    head: [
      chalk.magentaBright("코인"),
      chalk.magentaBright("현재가"),
      chalk.magentaBright("체결강도"),
      chalk.magentaBright("수익률"),
      chalk.magentaBright("평가손익"),
      chalk.magentaBright("평가금액"),
      chalk.magentaBright("보유수량"),
      chalk.magentaBright("변동률(24H)"),
      chalk.magentaBright("변동금액(24H)"),
      chalk.magentaBright("전일종가"),
      chalk.magentaBright("고가(24H)"),
      chalk.magentaBright("저가(24H)"),
    ],
    colWidths: [15, 15, 10, 12, 18, 18, 18, 15, 18, 15, 15, 15],
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

  for (const symbol of sortedSymbols) {
    // Iterate over sorted symbols
    const data: TickerContent = realTimeData[symbol];
    const price: string = parseFloat(data.closePrice).toLocaleString("ko-KR");
    const prevPrice: number = parseFloat(
      data.lastClosePrice || data.prevClosePrice
    );
    const changeRate: number = parseFloat(data.chgRate);
    const changeAmount: number = parseFloat(data.chgAmt);

    let priceColor = chalk.white;
    const currentClosePrice: number = parseFloat(data.closePrice);

    if (currentClosePrice > prevPrice) {
      priceColor = chalk.red;
    } else if (currentClosePrice < prevPrice) {
      priceColor = chalk.blue;
    }

    let rateColor = chalk.white;
    if (changeRate > 0) {
      rateColor = chalk.green;
    } else if (changeRate < 0) {
      rateColor = chalk.red;
    }

    const icon: string = iconMap[symbol] || " ";

    const coinConfig = appConfig.coins.find(
      (c) => c.symbol + "_" + (c.unit_currency || "KRW") === symbol
    );

    let profitLossRate = "-";
    let profitLossAmount = "-";
    let evaluationAmount = "-";
    let purchaseAmount = "-";
    let holdingQuantity = "-";
    let profitLossColor = chalk.white;

    if (
      coinConfig &&
      coinConfig.averagePurchasePrice > 0 &&
      coinConfig.balance &&
      coinConfig.balance > 0
    ) {
      const currentPrice = parseFloat(data.closePrice);
      const avgPrice = coinConfig.averagePurchasePrice;
      const balance = coinConfig.balance;

      // 이 줄을 추가하여 디버깅합니다.
      console.log(`Calculating profit/loss for ${symbol}:`, {
        averagePurchasePrice: coinConfig.averagePurchasePrice,
        balance: coinConfig.balance,
        closePrice: data.closePrice
      });

      const rate = ((currentPrice - avgPrice) / avgPrice) * 100;
      profitLossRate = `${rate.toFixed(2)}%`;

      const pnl = (currentPrice - avgPrice) * balance;
      profitLossAmount = `${pnl.toLocaleString("ko-KR", {
        maximumFractionDigits: 0,
      })} KRW`;

      const evalAmount = currentPrice * balance;
      evaluationAmount = `${evalAmount.toLocaleString("ko-KR", {
        maximumFractionDigits: 0,
      })} KRW`;

      const purchAmount = avgPrice * balance;
      purchaseAmount = `${purchAmount.toLocaleString("ko-KR", {
        maximumFractionDigits: 0,
      })} KRW`;

      holdingQuantity = `${balance.toLocaleString("ko-KR")}`;

      if (rate > 0) {
        profitLossColor = chalk.green;
      } else if (rate < 0) {
        profitLossColor = chalk.red;
      }
    } else {
      // 이 else 블록을 추가하여 디버깅합니다.
      console.log(`Skipping profit/loss for ${symbol}:`, {
        coinConfigExists: !!coinConfig,
        averagePurchasePrice: coinConfig?.averagePurchasePrice,
        balance: coinConfig?.balance
      });
    }

    table.push([
      chalk.yellow(`${icon} ${symbol}`),
      priceColor(`${price} KRW`),
      parseFloat(data.volumePower).toFixed(2),
      profitLossColor(profitLossRate),
      profitLossColor(profitLossAmount),
      priceColor(evaluationAmount),
      holdingQuantity,
      rateColor(`${changeRate.toFixed(2)}%`),
      rateColor(`${changeAmount.toLocaleString("ko-KR")} KRW`),
      parseFloat(data.prevClosePrice).toLocaleString("ko-KR"),
      parseFloat(data.highPrice).toLocaleString("ko-KR"),
      parseFloat(data.lowPrice).toLocaleString("ko-KR"),
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
      marketSentiment = "전체 시장: 강한 하락세 📉";
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

  // 콘솔을 지우고 테이블 출력 (깜빡임 방지)
  process.stdout.write('\x1B[2J\x1B[H');
  console.log(chalk.bold("Bithumb 실시간 시세 (Ctrl+C to exit)"));
  console.log(sentimentColor(marketSentiment)); // Display market sentiment
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
      }
      else {
        // For the first message, set lastClosePrice to current closePrice
        content.lastClosePrice = content.closePrice;
      }

      // 실시간 데이터 업데이트
      realTimeData[content.symbol] = content;
      
      // 깜빡임 감소를 위해 redrawTable 호출을 디바운스합니다. 따라서 redrawTable 호출을 디바운스합니다.
      if (!redrawTimeout) {
        redrawTimeout = setTimeout(() => {
          redrawTable();
          redrawTimeout = null;
        }, 80); // 80ms 간격으로 다시 그립니다.
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

// 프로그램 시작
initializeAppConfig().then(connect);
