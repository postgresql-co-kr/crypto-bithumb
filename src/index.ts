#!/usr/bin/env node
import chalk from "chalk";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import readline from "readline";

import { AppConfig, Exchange } from "./common";
import { redrawTable, setDisplayOptions } from "./ui";
import { Bithumb } from "./exchanges/Bithumb";
import { Upbit } from "./exchanges/Upbit";
import { Binance } from "./exchanges/Binance";

// --- CONFIG & ARGS ---
function ensureConfigFile() {
  const homeDir = os.homedir();
  const configDir = path.join(homeDir, ".debate300");
  const configFilePath = path.join(configDir, "config.json");

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

  if (!fs.existsSync(configFilePath)) {
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
ensureConfigFile();

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
const appConfig = loadConfig();

const args = process.argv.slice(2);
const sortBy = args.includes("--sort-by")
  ? args[args.indexOf("--sort-by") + 1] || "rate"
  : "rate";
const limit = args.includes("--limit")
  ? parseInt(args[args.indexOf("--limit") + 1] || "0", 10)
  : 0;
setDisplayOptions(limit, sortBy);
// --- END CONFIG & ARGS ---

class App {
  private exchanges: Exchange[];
  private activeExchange: Exchange | null = null;
  private redrawTimeout: NodeJS.Timeout | null = null;
  private rl: readline.Interface;

  constructor() {
    const redraw = this.debouncedRedraw.bind(this);
    this.exchanges = [
      new Bithumb(redraw),
      new Upbit(redraw),
      new Binance(redraw),
    ];
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "> ",
    });
    this.setupInput();
    this.setupResize();
  }

  private debouncedRedraw() {
    if (!this.redrawTimeout) {
      this.redrawTimeout = setTimeout(() => {
        this.draw();
        this.redrawTimeout = null;
      }, 1000); // 1000ms debounce
    }
  }

  private draw() {
    const menu = `  ${chalk.bold("Menu:")} ${chalk.cyan(
      "1"
    )} Bithumb | ${chalk.cyan("2")} Upbit | ${chalk.cyan(
      "3"
    )} Binance | ${chalk.bold("Quit:")} ${chalk.red("q")}`;

    process.stdout.write("\x1B[H\x1B[J"); // Clear screen
    if (this.activeExchange) {
      redrawTable(this.activeExchange.name, this.activeExchange.getData());
    }
    process.stdout.write("\n" + menu);
    this.rl.prompt(true);
  }

  private setupInput() {
    this.rl.on("line", (line) => {
      const command = line.trim();
      if (command === "q" || command === "quit") {
        process.exit();
      }
      if (command.startsWith("/")) {
        const index = parseInt(command.substring(1), 10) - 1;
        if (index >= 0 && index < this.exchanges.length) {
          this.switchExchange(index);
        } else {
          this.rl.prompt(true);
        }
      } else {
        this.rl.prompt(true);
      }
    });

    this.rl.on("SIGINT", () => {
      process.exit();
    });
  }

  private setupResize() {
    process.stdout.on("resize", () => this.debouncedRedraw());
  }

  async switchExchange(index: number) {
    if (this.activeExchange?.name === this.exchanges[index].name) {
      this.draw();
      return;
    }

    if (this.activeExchange) {
      this.activeExchange.disconnect();
    }
    this.activeExchange = this.exchanges[index];
    await this.activeExchange.connect(appConfig);
    this.draw();
  }

  public async start() {
    // Start with the first exchange by default
    this.switchExchange(0);
  }
}

const app = new App();
app.start().catch((err) => {
  console.error(chalk.red("애플리케이션 시작 중 오류 발생:"), err);
  process.exit(1);
});

process.on("SIGINT", () => {
  console.log(chalk.blue("\n프로그램을 종료합니다."));
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  process.exit(0);
});
