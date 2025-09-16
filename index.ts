#!/usr/bin/env node
import WebSocket from "ws";
import chalk from "chalk";
import Table from "cli-table3";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import axios from "axios";
import * as jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import notifier from "node-notifier";
import { exec } from "child_process";
import * as readline from "readline";
import * as crypto from "crypto";
import { URLSearchParams } from "url";
import * as querystring from "querystring";

let currentView: "market" | "open_orders" = "market";

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

// 프로그램 시작 시 커서를 숨깁니다.
process.stdout.write("\x1B[?25l");

// 프로그램 종료 시 커서가 다시 보이도록 보장합니다.
process.on("exit", () => {
  process.stdout.write("\x1B[?25h");
});
process.on("SIGINT", () => {
  process.exit();
});

// 커맨드 라인 인수 처리
const args = process.argv.slice(2);
let sortBy = "rate"; // 기본 정렬: 변동률
let displayLimit = 30; // 기본 표시 갯수

const sortByArgIndex = args.indexOf("--sort-by");
if (sortByArgIndex > -1 && args[sortByArgIndex + 1]) {
  const sortArg = args[sortByArgIndex + 1];
  // 허용된 정렬 옵션인지 확인
  if (["name", "rate", "my"].includes(sortArg)) {
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
  } else {
    console.log(
      chalk.yellow(
        `Warning: Invalid limit option '${
          args[limitArgIndex + 1]
        }'. Using default of ${displayLimit}.`
      )
    );
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

interface OpenOrderItem {
  uuid: string;
  side: "ask" | "bid";
  ord_type: "limit" | "market" | "stop_limit";
  price: string | null;
  state: "wait" | "watch" | "done" | "cancel";
  market: string;
  created_at: string;
  volume: string | null;
  remaining_volume: string | null;
  reserved_fee: string;
  remaining_fee: string;
  paid_fee: string;
  locked: string;
  executed_volume: string;
  trades_count: number;
}

interface Accounts {
  currency: string; // symbol
  balance: string; // 보유 수량
  locked: string; // 매도 수량
  avg_buy_price: string; // 령균 매수가
  avg_buy_price_modified: boolean;
  unit_currency: string; // KRW, BTC
}

// Interface for realTimeData object
interface RealTimeData {
  [key: string]: TickerContent;
}

let userPoints: number = 0;
let krwBalance: number = 0;
let krwLocked: number = 0;

let appConfig: AppConfig;
let apiConfig: ApiConfig | null = null;
let fetchUserHoldingsErrorCount = 0;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

function loadConfig(): AppConfig {
  const currentDirConfigPath = path.join(process.cwd(), "config.json");
  const homeDirConfigPath = path.join(
    os.homedir(),
    ".debate300",
    "config.json"
  );
  const homeDirApiKeysPath = path.join(
    os.homedir(),
    ".debate300",
    "api_keys.json"
  );

  // Check for api_keys.json and handle it first
  if (!fs.existsSync(homeDirApiKeysPath)) {
    const defaultApiKeys = {
      bithumb_api_key: "YOUR_API_KEY",
      bithumb_secret_key: "YOUR_SECRET_KEY",
    };
    fs.writeFileSync(
      homeDirApiKeysPath,
      JSON.stringify(defaultApiKeys, null, 2),
      "utf8"
    );
    console.error(chalk.red("API 키 파일이 없어 기본 파일을 생성했습니다."));
    console.error(chalk.yellow(`파일 위치: ${homeDirApiKeysPath}`));
    console.error(
      chalk.yellow("파일을 열어 본인의 빗썸 API 키를 입력해주세요.")
    );
    console.error(chalk.yellow("API 키 발급은 README.md 파일을 참고하세요."));
    process.exit(1);
  }

  const apiConfigContent = fs.readFileSync(homeDirApiKeysPath, "utf8");
  apiConfig = JSON.parse(apiConfigContent);

  if (
    !apiConfig ||
    apiConfig.bithumb_api_key === "YOUR_API_KEY" ||
    apiConfig.bithumb_secret_key === "YOUR_SECRET_KEY"
  ) {
    console.error(chalk.red("빗썸 API 키가 설정되지 않았습니다."));
    console.error(chalk.yellow(`파일 위치: ${homeDirApiKeysPath}`));
    console.error(
      chalk.yellow("파일을 열어 본인의 빗썸 API 키를 입력해주세요.")
    );
    console.error(chalk.yellow("API 키 발급은 README.md 파일을 참고하세요."));
    process.exit(1);
  }

  // Proceed with loading config.json
  let configContent: string | undefined;
  let configPathUsed: string | undefined;

  if (fs.existsSync(currentDirConfigPath)) {
    configContent = fs.readFileSync(currentDirConfigPath, "utf8");
    configPathUsed = currentDirConfigPath;
  } else if (fs.existsSync(homeDirConfigPath)) {
    configContent = fs.readFileSync(homeDirConfigPath, "utf8");
    configPathUsed = homeDirConfigPath;
  } else {
    // This part should not be reached if ensureConfigFile works correctly
    console.error(chalk.red("오류: 'config.json' 파일을 찾을 수 없습니다."));
    process.exit(1);
  }

  console.log(
    chalk.green(
      "API keys loaded successfully. Attempting to fetch user holdings from Bithumb API."
    )
  );

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
  iconMap[coin.symbol + "_" + (coin.unit_currency || "KRW")] = coin.icon; // unit_currency 추가
});

// 구독할 코인 목록 (예: BTC, ETH, XRP)
let symbols: string[] = appConfig.coins.map(
  (coin) => coin.symbol + "_" + (coin.unit_currency || "KRW")
); // unit_currency 추가

// Bithumb API Base URL (for v1 API)
const BITHUMB_API_BASE_URL = "https://api.bithumb.com";

// Function to fetch user holdings from Bithumb API
async function fetchUserHoldings(): Promise<CoinConfig[]> {
  if (!apiConfig) {
    // console.log(chalk.yellow("API keys not available. Cannot fetch user holdings."));
    return [];
  }

  const currentApiConfig: ApiConfig = apiConfig;

  if (
    !currentApiConfig.bithumb_api_key ||
    !currentApiConfig.bithumb_secret_key
  ) {
    console.log(
      chalk.yellow(
        "Bithumb API key or secret is missing. Cannot fetch user holdings.\n"
      )
    );
    return [];
  }

  const endpoint = "/v1/accounts"; // 계좌 정보 엔드포인트
  const fullUrl = `${BITHUMB_API_BASE_URL}${endpoint}`;

  // JWT 토큰 생성
  const payload = {
    access_key: currentApiConfig.bithumb_api_key,
    nonce: uuidv4(),
    timestamp: Date.now(),
  };
  const jwtToken = jwt.sign(payload, currentApiConfig.bithumb_secret_key);

  try {
    const response = await axios.get(fullUrl, {
      // GET 요청으로 변경
      headers: {
        Authorization: `Bearer ${jwtToken}`,
      },
    });

    if (response.status === 200) {
      fetchUserHoldingsErrorCount = 0; // 성공 시 에러 카운터 리셋
      // status 확인 조건 추가
      const data = response.data; // response.data.data 사용
      const userHoldings: CoinConfig[] = [];

      // 응답 구조에 따라 데이터 처리
      data.forEach((item: Accounts) => {
        const currency = item.currency;
        const balance = parseFloat(item.balance);
        const locked = parseFloat(item.locked);
        const avg_buy_price = parseFloat(item.avg_buy_price);
        const unit_currency = item.unit_currency || "KRW"; // unit_currency 추가

        if (currency === "P") {
          userPoints = balance;
        } else if (currency === "KRW") {
          krwBalance = balance;
          krwLocked = locked;
        } else if (avg_buy_price > 0) {
          userHoldings.push({
            symbol: currency,
            icon: iconMap[currency + "_" + unit_currency] || " ", // unit_currency 추가
            averagePurchasePrice: avg_buy_price,
            balance: balance,
            locked: locked,
            unit_currency: unit_currency, // unit_currency 추가
          });
        }
      });

      // console.log(chalk.green("Successfully fetched user holdings from Bithumb API."));
      return userHoldings;
    } else {
      fetchUserHoldingsErrorCount++;
      if (
        fetchUserHoldingsErrorCount === 1 ||
        fetchUserHoldingsErrorCount >= 3
      ) {
        console.error(chalk.red(`Bithumb API Error: ${response.data.message}`));
      }
      return [];
    }
  } catch (error: any) {
    // Add : any to error for type checking
    fetchUserHoldingsErrorCount++;
    if (
      axios.isAxiosError(error) &&
      error.response &&
      error.response.status === 403
    ) {
      console.error(
        chalk.red(
          "빗썸 API 키에 등록된 IP 주소가 아닙니다. 빗썸 웹사이트에서 IP 주소를 확인하거나 등록해주세요."
        )
      );
      process.exit(1);
    }

    if (axios.isAxiosError(error) && error.code === "ENOTFOUND") {
      console.error(
        chalk.red("네트워크 연결에 문제가 있어 빗썸 서버에 접속할 수 없습니다.")
      );
      console.error(
        chalk.yellow("인터넷 연결을 확인한 후 프로그램을 다시 시작해주세요.")
      );
      process.exit(1);
    }

    if (fetchUserHoldingsErrorCount === 1 || fetchUserHoldingsErrorCount >= 3) {
      console.error(
        chalk.red("Error fetching user holdings from Bithumb API:"),
        error
      );
    }
    return [];
  }
}

function updateCoinConfiguration(userHoldings: CoinConfig[]) {
  if (userHoldings.length <= 0) return;

  const mergedCoins: CoinConfig[] = [];
  const apiSymbols = new Set(
    userHoldings.map((h) => h.symbol + "_" + (h.unit_currency || "KRW"))
  );

  userHoldings.forEach((apiCoin) => {
    mergedCoins.push(apiCoin);
  });

  appConfig.coins.forEach((configCoin) => {
    if (
      !apiSymbols.has(
        configCoin.symbol + "_" + (configCoin.unit_currency || "KRW")
      )
    ) {
      mergedCoins.push(configCoin);
    } else {
      const existingCoin = mergedCoins.find(
        (mc) =>
          mc.symbol === configCoin.symbol &&
          mc.unit_currency === configCoin.unit_currency
      );
      if (existingCoin) {
        existingCoin.icon = configCoin.icon;
      }
    }
  });
  appConfig.coins = mergedCoins;
}

// Function to fetch market names from Bithumb API
async function fetchMarketInfo(): Promise<void> {
  try {
    // 유저가 제공한 응답 형식과 일치하는 Upbit API를 사용하여 코인 한글 이름을 가져옵니다.
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
      // console.log(chalk.green("Market names loaded successfully from Upbit API."));
    }
  } catch (error) {
    // console.error(chalk.red("한글 코인 이름 로딩 오류:"), error);
  }
}

// Modify appConfig and symbols based on API data if available
async function initializeAppConfig() {
  await fetchMarketInfo();
  if (apiConfig) {
    if (sortByArgIndex === -1) {
      sortBy = "my";
    }
    const userHoldings = await fetchUserHoldings();
    updateCoinConfiguration(userHoldings);
    symbols = appConfig.coins.map(
      (coin) => coin.symbol + "_" + (coin.unit_currency || "KRW")
    ); // unit_currency 추가
    console.log(
      chalk.green(
        "App configuration initialized with user holdings from Bithumb API."
      )
    );
  }
}

function schedulePeriodicUpdates() {
  setInterval(async () => {
    if (apiConfig) {
      // console.log(chalk.cyan("Periodically updating coin information..."));
      const userHoldings = await fetchUserHoldings();
      updateCoinConfiguration(userHoldings);
      // console.log(chalk.cyan("Coin information has been updated."));
    }
  }, 10000);
}

// Bithumb WebSocket URL
const wsUri: string = "wss://pubwss.bithumb.com/pub/ws";
let ws: WebSocket | null = null;

// 실시간 시세 데이터를 저장할 객체
const realTimeData: RealTimeData = {};
let redrawTimeout: NodeJS.Timeout | null = null;
const RECONNECT_INTERVAL = 5000; // 5 seconds
const lastNotificationLevels: {
  [symbol: string]: { positive: number; negative: number };
} = {};

// 콘솔을 지우고 테이블을 다시 그리는 함수
function drawMarketView(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    connect();
    return;
  }
  let totalEvaluationAmount = 0;
  let totalProfitLossAmount = 0;
  let totalPurchaseAmount = 0;

  // 테이블 생성
  const table = new Table({
    head: [
      chalk.magentaBright("코인"),
      chalk.magentaBright("현재가"),
      chalk.magentaBright("전일대비"),
      chalk.magentaBright("전일대비금액"),
      chalk.magentaBright("체결강도"),

      chalk.magentaBright("평가손익"),
      chalk.magentaBright("수익률"),
      chalk.magentaBright("보유수량"),
      chalk.magentaBright("평균매수가"),

      chalk.magentaBright("매수금액"),
      chalk.magentaBright("평가금액"),

      chalk.magentaBright("전일종가"),
      chalk.magentaBright("고가"),
      chalk.magentaBright("저가"),
    ],
    colWidths: [22, 18, 10, 15, 10, 15, 10, 12, 15, 18, 18, 12, 18, 18],
  });

  const allSymbolsSet = new Set([
    ...appConfig.coins.map((c) => `${c.symbol}_${c.unit_currency || "KRW"}`),
    ...Object.keys(realTimeData),
  ]);
  const allSymbols = Array.from(allSymbolsSet);

  // 저장된 실시간 데이터로 테이블 채우기
  // --sort-by 인수에 따라 정렬. 기본은 변동률순.
  const sortedSymbols: string[] = allSymbols.sort((a: string, b: string) => {
    const coinAConfig = appConfig.coins.find(
      (c) => `${c.symbol}_${c.unit_currency || "KRW"}` === a
    );
    const coinBConfig = appConfig.coins.find(
      (c) => `${c.symbol}_${c.unit_currency || "KRW"}` === b
    );

    const aIsHolding = !!(
      coinAConfig &&
      ((coinAConfig.balance || 0) > 0 || (coinAConfig.locked || 0) > 0)
    );
    const bIsHolding = !!(
      coinBConfig &&
      ((coinBConfig.balance || 0) > 0 || (coinBConfig.locked || 0) > 0)
    );

    if (aIsHolding && !bIsHolding) return -1;
    if (!aIsHolding && bIsHolding) return 1;

    const dataA = realTimeData[a];
    const dataB = realTimeData[b];

    if (dataA && !dataB) return -1;
    if (!dataA && dataB) return 1;
    if (!dataA && !dataB) return a.localeCompare(b);

    if (sortBy === "name") {
      return a.localeCompare(b); // 이름순
    }
    if (sortBy === "my") {
      const balanceA = (coinAConfig?.balance || 0) + (coinAConfig?.locked || 0);
      const balanceB = (coinBConfig?.balance || 0) + (coinBConfig?.locked || 0);
      const priceA = parseFloat(dataA?.closePrice || "0");
      const priceB = parseFloat(dataB?.closePrice || "0");
      const valueA = balanceA * priceA;
      const valueB = balanceB * priceB;
      return valueB - valueA; // 보유금액이 큰 순서로 정렬
    }
    // 기본 정렬: 변동률 기준 내림차순
    const rateA: number = parseFloat(dataA.chgRate);
    const rateB: number = parseFloat(dataB.chgRate);
    return rateB - rateA;
  });

  const displaySymbols =
    sortedSymbols.length > displayLimit
      ? sortedSymbols.slice(0, displayLimit)
      : sortedSymbols;

  for (const symbol of displaySymbols) {
    const data: TickerContent | undefined = realTimeData[symbol];
    const coinConfig = appConfig.coins.find(
      (c) => c.symbol + "_" + (c.unit_currency || "KRW") === symbol
    );
    const icon: string = coinConfig?.icon || iconMap[symbol] || " ";
    const koreanName = marketInfo[symbol]?.korean_name;
    const displayName = koreanName
      ? `${symbol.replace("_KRW", "")} ${koreanName}`
      : symbol;

    if (!data) {
      const balance = (coinConfig?.balance || 0) + (coinConfig?.locked || 0);
      const avgPrice = coinConfig?.averagePurchasePrice || 0;
      table.push([
        chalk.yellow(`${icon} ${displayName}`),
        chalk.gray("Loading..."),
        chalk.gray("-"),
        chalk.gray("-"),
        chalk.gray("-"),
        chalk.gray("-"),
        chalk.gray("-"),
        balance > 0 ? `${balance.toLocaleString("ko-KR")}` : "-",
        avgPrice > 0 ? avgPrice.toLocaleString("ko-KR") : "-",
        chalk.gray("-"),
        chalk.gray("-"),
        chalk.gray("-"),
        chalk.gray("-"),
        chalk.gray("-"),
      ]);
      continue;
    }

    // Iterate over sorted symbols
    const price: string = parseFloat(data.closePrice).toLocaleString("ko-KR");
    const prevPrice: number = parseFloat(
      data.lastClosePrice || data.prevClosePrice
    );
    const changeRate: number = parseFloat(data.chgRate);
    const changeAmount: number = parseFloat(data.chgAmt);

    let priceColor = chalk.white;
    const currentClosePrice: number = parseFloat(data.closePrice);

    if (currentClosePrice > prevPrice) {
      priceColor = chalk.redBright;
    } else if (currentClosePrice < prevPrice) {
      priceColor = chalk.cyanBright;
    }

    let rateColor = chalk.white;
    if (changeRate > 0) {
      rateColor = chalk.green;
    } else if (changeRate < 0) {
      rateColor = chalk.red;
    }

    let profitLossRate = "-";
    let profitLossAmount = "-";
    let evaluationAmount = "-";
    let purchaseAmount = "-";
    let holdingQuantity = "-";
    let avgPurchasePrice = "-";
    let profitLossColor = chalk.white;

    if (coinConfig && coinConfig.averagePurchasePrice > 0) {
      const currentPrice = parseFloat(data.closePrice);
      const avgPrice = coinConfig.averagePurchasePrice;
      avgPurchasePrice = avgPrice.toLocaleString("ko-KR");

      const rate = ((currentPrice - avgPrice) / avgPrice) * 100;
      profitLossRate = `${rate.toFixed(2)}%`;

      let balance = 0;
      balance += coinConfig.balance ? coinConfig.balance : 0;
      balance += coinConfig.locked ? coinConfig.locked : 0;

      if (balance > 0) {
        const pnl = (currentPrice - avgPrice) * balance;
        totalProfitLossAmount += pnl;
        profitLossAmount = `${pnl.toLocaleString("ko-KR", {
          maximumFractionDigits: 0,
        })} KRW`;

        const evalAmount = currentPrice * balance;
        totalEvaluationAmount += evalAmount;
        evaluationAmount = `${evalAmount.toLocaleString("ko-KR", {
          maximumFractionDigits: 0,
        })} KRW`;

        const purchAmount = avgPrice * balance;
        totalPurchaseAmount += purchAmount;
        purchaseAmount = `${purchAmount.toLocaleString("ko-KR", {
          maximumFractionDigits: 0,
        })} KRW`;
        holdingQuantity = `${balance.toLocaleString("ko-KR")}`;
      }

      if (rate > 0) {
        profitLossColor = chalk.green;
      } else if (rate < 0) {
        profitLossColor = chalk.red;
      }
    }

    const highPriceNum = parseFloat(data.highPrice);
    const lowPriceNum = parseFloat(data.lowPrice);
    const prevClosePriceNum = parseFloat(data.prevClosePrice);

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
      rateColor(`${changeRate.toFixed(2)}%`),
      rateColor(`${changeAmount.toLocaleString("ko-KR")} KRW`),
      parseFloat(data.volumePower).toFixed(2),

      profitLossColor(profitLossAmount),
      profitLossColor(profitLossRate),
      holdingQuantity,
      avgPurchasePrice,

      purchaseAmount,
      evaluationAmount,

      parseFloat(data.prevClosePrice).toLocaleString("ko-KR"),
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

    if (totalPurchaseAmount > 0) {
      const formattedPurchase = totalPurchaseAmount.toLocaleString("ko-KR", {
        maximumFractionDigits: 0,
      });
      const formattedEval = totalEvaluationAmount.toLocaleString("ko-KR", {
        maximumFractionDigits: 0,
      });
      const formattedPnl = totalProfitLossAmount.toLocaleString("ko-KR", {
        maximumFractionDigits: 0,
      });
      const pnlColor =
        totalProfitLossAmount > 0
          ? chalk.green
          : totalProfitLossAmount < 0
          ? chalk.red
          : chalk.white;

      marketSentiment += ` | 총 매수금액: ${formattedPurchase} KRW`;
      marketSentiment += ` | 총 평가금액: ${formattedEval} KRW`;
      marketSentiment += ` | 총 평가손익: ${pnlColor(`${formattedPnl} KRW`)}`;
    }

    const krwHoldings = krwBalance + krwLocked;
    if (krwHoldings > 0) {
      marketSentiment += ` | 보유원화: ${krwHoldings.toLocaleString("ko-KR", {
        maximumFractionDigits: 0,
      })} KRW`;
    }
    if (krwBalance > 0) {
      marketSentiment += ` | 주문가능원화: ${krwBalance.toLocaleString(
        "ko-KR",
        {
          maximumFractionDigits: 0,
        }
      )} KRW`;
    }
    if (userPoints > 0) {
      marketSentiment += ` | 포인트: ${userPoints.toLocaleString("ko-KR", {
        maximumFractionDigits: 0,
      })}`;
    }
  } else {
    marketSentiment = "전체 시장: 데이터 부족";
    sentimentColor = chalk.gray;
  }

  // 화면 출력을 위한 버퍼 생성
  const output: string[] = [];
  output.push(
    chalk.bold(
      "Bithumb 실시간 시세 (메뉴: /1:시세, /2:미체결, /q 또는 /exit:종료) - Debate300.com"
    )
  );
  output.push(sentimentColor(marketSentiment)); // Display market sentiment
  output.push(table.toString());

  if (sortedSymbols.length > displayLimit) {
    output.push(
      chalk.yellow(
        `참고: 시세 표시가 ${displayLimit}개로 제한되었습니다. (총 ${sortedSymbols.length}개)`
      )
    );
  }

  readline.cursorTo(process.stdout, 0, 0);
  readline.clearScreenDown(process.stdout);
  process.stdout.write(output.join("\n"));

  process.stdout.write("\n명령어: /1(시세), /2(미체결), /exit(종료)");
  rl.prompt(true);
}

async function fetchOpenOrders(): Promise<OpenOrderItem[]> {
  if (!apiConfig) {
    return [];
  }

  const endpoint = "/v1/orders";
  const queryParams: any = {
    limit: 100,
    page: 1,
    order_by: "desc",
    // states: ["wait", "watch"], // 미체결 상태
  };

  const query = querystring.stringify(queryParams);

  const alg = "SHA512";
  const hash = crypto.createHash(alg);
  const queryHash = hash.update(query, "utf-8").digest("hex");

  const payload = {
    access_key: apiConfig.bithumb_api_key,
    nonce: uuidv4(),
    timestamp: Date.now(),
    query_hash: queryHash,
    query_hash_alg: alg,
  };

  const jwtToken = jwt.sign(payload, apiConfig.bithumb_secret_key);

  const config = {
    headers: {
      Authorization: `Bearer ${jwtToken}`,
    },
  };

  try {
    const response = await axios.get(
      `${BITHUMB_API_BASE_URL}${endpoint}?${query}`,
      config
    );
    if (response.status === 200) {
      return response.data as OpenOrderItem[];
    }
    return [];
  } catch (error: any) {
    // console.error(
    //   "Error fetching open orders:",
    //   error.response ? error.response.data : error.message
    // );
    return [];
  }
}

async function drawOpenOrdersView() {
  readline.cursorTo(process.stdout, 0, 0);
  readline.clearScreenDown(process.stdout);
  process.stdout.write("미체결 내역을 불러오는 중...");

  const openOrders = await fetchOpenOrders();

  const table = new Table({
    head: [
      "코인",
      "주문종류",
      "현재가",
      "주문가격",
      "괴리율",
      "평균매수가",
      "현재수익률",
      "예상수익률",
      "예상수익금",
      "주문수량",
      "미체결수량",
      "총 금액",
      "주문일시",
    ],
    colWidths: [24, 10, 18, 18, 12, 18, 12, 12, 15, 15, 15, 20, 25],
  });

  if (openOrders.length === 0) {
    table.push([{ colSpan: 13, content: "미체결 내역이 없습니다." }]);
  } else {
    openOrders.sort((a, b) => {
      if (a.market < b.market) {
        return -1;
      }
      if (a.market > b.market) {
        return 1;
      }
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });

    for (const order of openOrders) {
      const marketParts = order.market.split("-");
      const symbolForLookup = `${marketParts[1]}_${marketParts[0]}`;

      const koreanName = marketInfo[symbolForLookup]?.korean_name;
      const displayName = koreanName
        ? `${symbolForLookup.replace("_KRW", "")} ${koreanName}`
        : symbolForLookup;

      let currentPrice = 0;
      const currentTicker = realTimeData[symbolForLookup];

      if (currentTicker) {
        currentPrice = parseFloat(currentTicker.closePrice);
      } else {
        try {
          const tickerResponse = await axios.get(
            `${BITHUMB_API_BASE_URL}/public/ticker/${symbolForLookup}`
          );
          if (tickerResponse.data.status === "0000") {
            currentPrice = parseFloat(tickerResponse.data.data.closing_price);
          }
        } catch (e) {
          /* ignore */
        }
      }

      const currentPriceDisplay =
        currentPrice > 0 ? currentPrice.toLocaleString("ko-KR") : "N/A";

      const orderPrice = parseFloat(order.price || "0");

      let discrepancyRate = "-";
      let discrepancyColor = chalk.white;
      if (currentPrice > 0 && orderPrice > 0) {
        const rate = ((orderPrice - currentPrice) / currentPrice) * 100;
        if (rate > 0) {
          discrepancyColor = chalk.green;
          discrepancyRate = `+${rate.toFixed(2)}%`;
        } else if (rate < 0) {
          discrepancyColor = chalk.red;
          discrepancyRate = `${rate.toFixed(2)}%`;
        } else {
          discrepancyRate = `${rate.toFixed(2)}%`;
        }
      }

      const orderType =
        order.side === "bid" ? chalk.red("매수") : chalk.cyan("매도");
      const orderPriceDisplay = orderPrice.toLocaleString("ko-KR");
      const volume = parseFloat(order.volume || "0").toLocaleString("ko-KR");
      const remaining_volume = parseFloat(
        order.remaining_volume || "0"
      ).toLocaleString("ko-KR");
      const total = (
        orderPrice * parseFloat(order.volume || "0")
      ).toLocaleString("ko-KR", { maximumFractionDigits: 0 });
      const date = new Date(order.created_at).toLocaleString("ko-KR");

      const coinConfig = appConfig.coins.find(
        (c) => `${c.symbol}_${c.unit_currency || "KRW"}` === symbolForLookup
      );
      const icon: string = coinConfig?.icon || iconMap[symbolForLookup] || " ";

      let avgPurchasePriceDisplay = "-";
      let profitLossRateDisplay = "-";
      let profitLossColor = chalk.white;

      if (coinConfig && coinConfig.averagePurchasePrice > 0) {
        const avgPrice = coinConfig.averagePurchasePrice;
        avgPurchasePriceDisplay = avgPrice.toLocaleString("ko-KR");

        if (currentPrice > 0) {
          const rate = ((currentPrice - avgPrice) / avgPrice) * 100;
          if (rate > 0) {
            profitLossColor = chalk.green;
            profitLossRateDisplay = `+${rate.toFixed(2)}%`;
          } else if (rate < 0) {
            profitLossColor = chalk.red;
            profitLossRateDisplay = `${rate.toFixed(2)}%`;
          } else {
            profitLossRateDisplay = `${rate.toFixed(2)}%`;
          }
        }
      }

      let expectedProfitRateDisplay = "-";
      let expectedProfitRateColor = chalk.white;
      let expectedProfitAmountDisplay = "-";

      if (
        order.side === "ask" &&
        coinConfig &&
        coinConfig.averagePurchasePrice > 0 &&
        orderPrice > 0
      ) {
        const avgPrice = coinConfig.averagePurchasePrice;
        const expectedRate = ((orderPrice - avgPrice) / avgPrice) * 100;

        if (expectedRate > 0) {
          expectedProfitRateColor = chalk.green;
          expectedProfitRateDisplay = `+${expectedRate.toFixed(2)}%`;
        } else if (expectedRate < 0) {
          expectedProfitRateColor = chalk.red;
          expectedProfitRateDisplay = `${expectedRate.toFixed(2)}%`;
        } else {
          expectedProfitRateDisplay = `${expectedRate.toFixed(2)}%`;
        }

        const remainingVolume = parseFloat(order.remaining_volume || "0");
        if (remainingVolume > 0) {
          const expectedProfit = (orderPrice - avgPrice) * remainingVolume;
          expectedProfitAmountDisplay = expectedProfit.toLocaleString("ko-KR", {
            maximumFractionDigits: 0,
          });
        }
      }

      table.push([
        chalk.yellow(`${icon} ${displayName}`),
        orderType,
        `${currentPriceDisplay} ${marketParts[0]}`,
        `${orderPriceDisplay} ${marketParts[0]}`,
        discrepancyColor(discrepancyRate),
        avgPurchasePriceDisplay,
        profitLossColor(profitLossRateDisplay),
        expectedProfitRateColor(expectedProfitRateDisplay),
        expectedProfitRateColor(expectedProfitAmountDisplay),
        volume,
        remaining_volume,
        `${total} ${marketParts[0]}`,
        date,
      ]);
    }
  }

  const output: string[] = [];
  output.push(
    chalk.bold(
      "Bithumb 미체결 내역 (메뉴: /1:시세, /2:미체결, Ctrl+C:종료) - Debate300.com"
    )
  );
  output.push(table.toString());

  readline.cursorTo(process.stdout, 0, 0);
  readline.clearScreenDown(process.stdout);
  process.stdout.write(output.join("\n"));

  process.stdout.write("\n명령어: /1(시세), /2(미체결), /exit(종료)");
  rl.prompt(true);
}

function sendNotification(title: string, message: string) {
  if (os.platform() === "darwin") {
    const escapedTitle = title.replace(/"/g, '"');
    const escapedMessage = message.replace(/"/g, '"');
    const command = `osascript -e 'display notification "${escapedMessage}" with title "${escapedTitle}" sound name "Ping"'`;
    exec(command, (error) => {
      if (error) {
        console.error(
          `[Notification Error] Failed to execute osascript. Please ensure you are on macOS and that your terminal has notification permissions.`
        );
        console.error(`[Notification Error] Details: ${error.message}`);
      }
    });
  } else {
    // Fallback to node-notifier for other platforms
    notifier.notify(
      {
        title: title,
        message: message,
        sound: true,
        wait: false,
      },
      function (error, response) {
        if (error) console.error("Notification Error:", error);
      }
    );
  }
}

function connect(): void {
  // Prevent multiple connection attempts if one is already connecting or open
  if (
    ws &&
    (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)
  ) {
    return;
  }

  ws = new WebSocket(wsUri);

  ws.on("open", () => {
    console.log(chalk.green("Bithumb WebSocket에 연결되었습니다."));

    // 구독 메시지 전송
    const subscribeMsg = {
      type: "ticker",
      symbols: symbols,
      tickTypes: ["MID"], // 자정 기준 변동률
    };
    if (ws) {
      // Add null check here
      ws.send(JSON.stringify(subscribeMsg));
    }
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
          const message = `${koreanName}이(가) ${notificationLevel}% 이상 상승했습니다. 현재가: ${price} KRW (${changeRate.toFixed(
            2
          )}%)`;
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
          const message = `${koreanName}이(가) ${notificationLevel}% 이상 하락했습니다. 현재가: ${price} KRW (${changeRate.toFixed(
            2
          )}%)`;
          sendNotification(title, message);

          lastNotificationLevels[symbol].negative = currentLevel;
          lastNotificationLevels[symbol].positive = 0; // Reset positive level on negative change
        }
      }

      if (currentView === "market") {
        if (!redrawTimeout) {
          redrawTimeout = setTimeout(() => {
            drawMarketView();
            redrawTimeout = null;
          }, 100); // 100ms 간격으로 다시 그립니다.
        }
      }
    }
  });

  ws.on("error", (error: Error) => {
    console.error(chalk.red("WebSocket 오류 발생:"), error);
  });

  ws.on("close", () => {
    console.log(
      chalk.yellow(
        `WebSocket 연결이 종료되었습니다. ${
          RECONNECT_INTERVAL / 1000
        }초 후 재연결을 시도합니다.`
      )
    );
    ws = null;
    if (redrawTimeout) {
      clearTimeout(redrawTimeout);
      redrawTimeout = null;
    }
    setTimeout(connect, RECONNECT_INTERVAL);
  });
}

// 프로그램 시작
initializeAppConfig().then(() => {
  connect();
  if (apiConfig) {
    schedulePeriodicUpdates();
  }

  rl.on("line", (line) => {
    const command = line.trim().toLowerCase();
    switch (command) {
      case "/1":
      case "/시세":
        currentView = "market";
        drawMarketView();
        break;
      case "/2":
      case "/미체결":
        currentView = "open_orders";
        drawOpenOrdersView();
        break;
      case "/q":
      case "/exit":
        process.exit(0);
        break;
      default:
        if (command.startsWith("/")) {
          process.stdout.write(
            "알 수 없는 명령어입니다. 사용 가능한 명령어: /1, /2, /q, /exit\n"
          );
        }
        rl.prompt();
    }
  }).on("close", () => {
    process.exit(0);
  });

  drawMarketView();
});
