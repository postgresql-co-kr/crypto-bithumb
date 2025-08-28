import Table from "cli-table3";
import chalk from "chalk";
import { StandardizedTickerData } from "./common";

let displayLimit = 0;
let limitWasSetByUser = false;
let sortBy = "rate"; // 'rate' or 'name'

export function setDisplayOptions(limit: number, sort: string) {
    if (limit > 0) {
        displayLimit = limit;
        limitWasSetByUser = true;
    }
    if (["name", "rate"].includes(sort)) {
        sortBy = sort;
    }
}

export function redrawTable(exchangeName: string, data: Map<string, StandardizedTickerData>): void {
    const menu = `  ${chalk.bold('Menu:')} ${chalk.cyan('1')} Bithumb | ${chalk.cyan('2')} Upbit | ${chalk.cyan('3')} Binance`;

    if (exchangeName === 'Binance') {
        process.stdout.write("\x1B[H\x1B[J" + chalk.yellow(`\n${exchangeName} 연동은 아직 구현되지 않았습니다.`));
        process.stdout.write('\n\n' + menu);
        return;
    }

    if (data.size === 0) {
        process.stdout.write("\x1B[H\x1B[J" + chalk.yellow("\n데이터를 기다리는 중입니다..."));
        process.stdout.write('\n\n' + menu);
        return;
    }

    let currentDisplayLimit = displayLimit;
    if (!limitWasSetByUser) {
        const terminalHeight = process.stdout.rows || 30;
        currentDisplayLimit = Math.max(1, terminalHeight - 10); // Adjust for header/footer
    }

    const terminalWidth = process.stdout.columns || 150;
    const availableWidth = terminalWidth - (9 + 1) - 10;
    const colWidths = [
        Math.floor(availableWidth * 0.18), // 코인
        Math.floor(availableWidth * 0.12), // 현재가
        Math.floor(availableWidth * 0.08), // 체결강도
        Math.floor(availableWidth * 0.08), // 수익률
        Math.floor(availableWidth * 0.09), // 전일대비
        Math.floor(availableWidth * 0.11), // 전일대비금액
        Math.floor(availableWidth * 0.11), // 전일종가
        Math.floor(availableWidth * 0.12), // 고가
        Math.floor(availableWidth * 0.11), // 저가
    ];

    const table = new Table({
        head: [
            chalk.magentaBright("코인"), chalk.magentaBright("현재가"), chalk.magentaBright("체결강도"),
            chalk.magentaBright("수익률"), chalk.magentaBright("전일대비"), chalk.magentaBright("전일대비금액"),
            chalk.magentaBright("전일종가"), chalk.magentaBright("고가"), chalk.magentaBright("저가"),
        ],
        colWidths: colWidths,
        wordWrap: true,
    });

    const sortedData = Array.from(data.values()).sort((a, b) => {
        if (sortBy === "name") return a.symbol.localeCompare(b.symbol);
        return b.priceChangeRate - a.priceChangeRate;
    });

    const displayData = sortedData.slice(0, currentDisplayLimit);

    for (const d of displayData) {
        let profitLossStr = "-";
        let profitLossColor = chalk.white;
        if (d.profitLossRate !== undefined) {
            profitLossStr = `${d.profitLossRate.toFixed(2)}%`;
            if (d.profitLossRate > 0) profitLossColor = chalk.green;
            else if (d.profitLossRate < 0) profitLossColor = chalk.red;
        }

        let rateColor = chalk.white;
        if (d.priceChangeRate > 0) rateColor = chalk.green;
        else if (d.priceChangeRate < 0) rateColor = chalk.red;

        const highPricePercent = d.prevClosePrice > 0 ? ((d.highPrice - d.prevClosePrice) / d.prevClosePrice) * 100 : 0;
        const lowPricePercent = d.prevClosePrice > 0 ? ((d.lowPrice - d.prevClosePrice) / d.prevClosePrice) * 100 : 0;

        table.push([
            chalk.yellow(`${d.icon} ${d.koreanName}`),
            d.priceColor(`${d.currentPrice.toLocaleString("ko-KR")} KRW`),
            d.volumePower?.toFixed(2) || "-",
            profitLossColor(profitLossStr),
            rateColor(`${d.priceChangeRate.toFixed(2)}%`),
            rateColor(`${d.priceChangeAmount.toLocaleString("ko-KR")} KRW`),
            d.prevClosePrice.toLocaleString("ko-KR"),
            `${highPricePercent >= 0 ? chalk.green(`+${highPricePercent.toFixed(2)}%`) : chalk.red(`${highPricePercent.toFixed(2)}%`)} (${d.highPrice.toLocaleString("ko-KR")})`,
            `${lowPricePercent >= 0 ? chalk.green(`+${lowPricePercent.toFixed(2)}%`) : chalk.red(`${lowPricePercent.toFixed(2)}%`)} (${d.lowPrice.toLocaleString("ko-KR")})`,
        ]);
    }

    const output: string[] = [];
    output.push(chalk.bold(`${exchangeName} 실시간 시세 (Ctrl+C to exit)`));
    // Market sentiment logic can be re-added here if needed
    output.push(table.toString());
    if (sortedData.length > currentDisplayLimit) {
        output.push(chalk.yellow(`표시가 ${currentDisplayLimit}개로 제한되었습니다. (총 ${sortedData.length}개)`));
    }

    process.stdout.write(output.join("\n"));
}
