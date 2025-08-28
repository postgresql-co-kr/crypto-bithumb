
import { Exchange, AppConfig } from "../common";
import chalk from "chalk";

export class Binance extends Exchange {
    readonly name = "Binance";

    async connect(appConfig: AppConfig): Promise<void> {
        // 바이낸스 WebSocket 연결 로직 구현
        this.redrawCallback();
    }

    disconnect(): void {
        this.realTimeData.clear();
        console.log(chalk.yellow("Binance 연결이 해제되었습니다."));
    }
}
