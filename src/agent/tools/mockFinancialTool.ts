import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { FinancialTool, FinancialMetrics } from "./types.js";

const CURRENT_FILE: string = fileURLToPath(import.meta.url);
const CURRENT_DIR: string = dirname(CURRENT_FILE);
const MOCK_DATA_DIR: string = join(CURRENT_DIR, "..", "..", "..", "mock-data", "financial");

export class MockFinancialTool implements FinancialTool {
    async fetch(ticker: string): Promise<FinancialMetrics> {
        const tickerKey: string = ticker.trim().toUpperCase();
        const filePath: string = join(MOCK_DATA_DIR, `${tickerKey}.json`);

        if (!existsSync(filePath)) {
            throw new Error(`No mock financial data for ticker: ${tickerKey}`);
        }

        const raw: string = readFileSync(filePath, "utf-8");
        const data: FinancialMetrics = JSON.parse(raw);
        return data;
    }
}
