import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { createNewsTool, createFinancialTool } from "./index.js";

const newsToolDef = tool(
    "news_tool",
    "Fetch recent news articles for a publicly traded company. Returns up to 10 articles with title, source, date, summary, and URL.",
    {
        ticker: z.string().describe("Stock ticker symbol, e.g., AAPL, TSLA, MSFT")
    },
    async (args) => {
        const tickerInput: string = args.ticker;
        const newsTool = createNewsTool();
        const result = await newsTool.fetch(tickerInput);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2)
                }
            ]
        };
    }
);

const financialToolDef = tool(
    "financial_tool",
    "Fetch financial metrics for a publicly traded company. Returns stock price, market cap, revenue, profit margin, P/E ratio, and other key numbers.",
    {
        ticker: z.string().describe("Stock ticker symbol, e.g., AAPL, TSLA, MSFT")
    },
    async (args) => {
        const tickerInput: string = args.ticker;
        const financialTool = createFinancialTool();
        const result = await financialTool.fetch(tickerInput);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2)
                }
            ]
        };
    }
);

export const AIRA_MCP_SERVER_NAME: string = "aira-tools";

export const NEWS_TOOL_FULL_NAME: string = `mcp__${AIRA_MCP_SERVER_NAME}__news_tool`;
export const FINANCIAL_TOOL_FULL_NAME: string = `mcp__${AIRA_MCP_SERVER_NAME}__financial_tool`;

export function createAiraMcpServer() {
    return createSdkMcpServer({
        name: AIRA_MCP_SERVER_NAME,
        version: "0.1.0",
        tools: [newsToolDef, financialToolDef]
    });
}
