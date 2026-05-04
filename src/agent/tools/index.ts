import type { NewsTool, FinancialTool } from "./types.js";
import { MockNewsTool } from "./mockNewsTool.js";
import { MockFinancialTool } from "./mockFinancialTool.js";

export function createNewsTool(): NewsTool {
    const useReal: boolean = process.env.USE_REAL_NEWS === "true";
    if (useReal) {
        throw new Error("Real news tool is not yet implemented. Set USE_REAL_NEWS=false in .env.");
    }
    return new MockNewsTool();
}

export function createFinancialTool(): FinancialTool {
    const useReal: boolean = process.env.USE_REAL_FINANCIAL === "true";
    if (useReal) {
        throw new Error("Real financial tool is not yet implemented. Set USE_REAL_FINANCIAL=false in .env.");
    }
    return new MockFinancialTool();
}

export type { NewsTool, FinancialTool, NewsArticle, NewsToolResult, FinancialMetrics } from "./types.js";
