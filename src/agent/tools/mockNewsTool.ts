import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { NewsTool, NewsToolResult } from "./types.js";

const CURRENT_FILE: string = fileURLToPath(import.meta.url);
const CURRENT_DIR: string = dirname(CURRENT_FILE);
const MOCK_DATA_DIR: string = join(CURRENT_DIR, "..", "..", "..", "mock-data", "news");

export class MockNewsTool implements NewsTool {
    async fetch(ticker: string): Promise<NewsToolResult> {
        const tickerKey: string = ticker.trim().toUpperCase();
        const filePath: string = join(MOCK_DATA_DIR, `${tickerKey}.json`);

        if (!existsSync(filePath)) {
            return { ticker: tickerKey, articles: [] };
        }

        const raw: string = readFileSync(filePath, "utf-8");
        const data: NewsToolResult = JSON.parse(raw);
        return data;
    }
}
