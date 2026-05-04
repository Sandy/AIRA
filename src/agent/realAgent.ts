import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import {
    createAiraMcpServer,
    AIRA_MCP_SERVER_NAME,
    NEWS_TOOL_FULL_NAME,
    FINANCIAL_TOOL_FULL_NAME
} from "./tools/aiToolDefinitions.js";
import { createNewsTool, createFinancialTool } from "./tools/index.js";
import { calculateConfidence } from "./confidence.js";
import type { AgentResponse, AnalysisResult, Signal, StepCallback } from "./types.js";

const CURRENT_FILE: string = fileURLToPath(import.meta.url);
const CURRENT_DIR: string = dirname(CURRENT_FILE);
const CLAUDE_MD_PATH: string = join(CURRENT_DIR, "..", "..", "CLAUDE.md");

let cachedSystemPrompt: string | null = null;

function loadSystemPrompt(): string {
    if (cachedSystemPrompt === null) {
        cachedSystemPrompt = readFileSync(CLAUDE_MD_PATH, "utf-8");
    }
    return cachedSystemPrompt;
}

interface TextBlock {
    type: "text";
    text: string;
}

interface ToolUseBlock {
    type: "tool_use";
    name: string;
    input: unknown;
}

type ContentBlock = TextBlock | ToolUseBlock | { type: string };

interface AssistantMessage {
    type: "assistant";
    message: {
        content: ContentBlock[];
    };
}

interface ResultMessage {
    type: "result";
    subtype: string;
    total_cost_usd?: number;
    duration_ms?: number;
}

function tryParseAnalysis(rawText: string): AnalysisResult | null {
    let candidate: string = rawText.trim();

    const fenceMatch = candidate.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
        candidate = fenceMatch[1].trim();
    }

    const firstBrace: number = candidate.indexOf("{");
    const lastBrace: number = candidate.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        candidate = candidate.substring(firstBrace, lastBrace + 1);
    }

    try {
        return JSON.parse(candidate) as AnalysisResult;
    } catch {
        return null;
    }
}

function clampConfidence(value: unknown): number {
    if (typeof value !== "number" || Number.isNaN(value)) {
        return 0;
    }
    if (value < 0) {
        return 0;
    }
    if (value > 1) {
        return 1;
    }
    return value;
}

function shortToolName(fullName: string): string {
    const parts: string[] = fullName.split("__");
    return parts[parts.length - 1] || fullName;
}

export async function runRealAnalysis(ticker: string, onStep?: StepCallback): Promise<AgentResponse> {
    const model: string = process.env.AIRA_MODEL || "claude-haiku-4-5-20251001";
    const systemPrompt: string = loadSystemPrompt();
    const airaServer = createAiraMcpServer();

    onStep?.({ name: "planning", detail: `model=${model}, ticker=${ticker.toUpperCase()}` });

    const newsTool = createNewsTool();
    const financialTool = createFinancialTool();
    const referenceNews = await newsTool.fetch(ticker);
    const referenceFinancial = await financialTool.fetch(ticker);

    const userPrompt: string = `Analyze the publicly traded company with ticker symbol ${ticker.trim().toUpperCase()}. Use the news_tool and financial_tool to gather data, then return your final analysis as a single JSON object matching the schema in your system prompt. Do not output any text outside the JSON.`;

    const stream = query({
        prompt: userPrompt,
        options: {
            model,
            systemPrompt,
            mcpServers: {
                [AIRA_MCP_SERVER_NAME]: airaServer
            },
            allowedTools: [NEWS_TOOL_FULL_NAME, FINANCIAL_TOOL_FULL_NAME]
        }
    });

    let rawText: string = "";
    let cost: number = 0;
    let durationMs: number = 0;

    for await (const message of stream) {
        if (message.type === "assistant") {
            const assistantMessage = message as unknown as AssistantMessage;
            for (const block of assistantMessage.message.content) {
                if (block.type === "text") {
                    const textBlock = block as TextBlock;
                    if (textBlock.text) {
                        rawText += textBlock.text;
                    }
                }
                if (block.type === "tool_use") {
                    const toolBlock = block as ToolUseBlock;
                    const detail: string = typeof toolBlock.input === "object"
                        ? JSON.stringify(toolBlock.input)
                        : String(toolBlock.input);
                    onStep?.({
                        name: `called_${shortToolName(toolBlock.name)}`,
                        detail
                    });
                }
            }
        }

        if (message.type === "result") {
            const resultMessage = message as unknown as ResultMessage;
            cost = resultMessage.total_cost_usd ?? 0;
            durationMs = resultMessage.duration_ms ?? 0;
        }
    }

    const parsed: AnalysisResult | null = tryParseAnalysis(rawText);

    if (parsed === null) {
        onStep?.({ name: "parse_failed", detail: "Could not extract JSON from agent output" });
        return {
            analysis: null,
            rawText,
            cost,
            durationMs,
            error: "Failed to parse JSON from agent output"
        };
    }

    const claudeConfidence: number = clampConfidence(parsed.confidence);
    const computedConfidence: number = calculateConfidence(
        referenceNews.articles,
        referenceFinancial,
        parsed.signal as Signal
    );
    const safeConfidence: number = Math.min(claudeConfidence, computedConfidence);

    onStep?.({
        name: "confidence_check",
        detail: `claude=${claudeConfidence}, computed=${computedConfidence}, final=${safeConfidence}`
    });

    const finalAnalysis: AnalysisResult = {
        ...parsed,
        confidence: safeConfidence
    };

    return {
        analysis: finalAnalysis,
        rawText,
        cost,
        durationMs
    };
}
