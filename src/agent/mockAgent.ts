import { createNewsTool, createFinancialTool } from "./tools/index.js";
import { calculateConfidence } from "./confidence.js";
import type { AgentResponse, AnalysisResult, Signal, SourceRef, StepCallback } from "./types.js";

function decideSignal(revenueYoyPercent: number): Signal {
    if (revenueYoyPercent >= 10) {
        return "buy";
    }
    if (revenueYoyPercent >= 0) {
        return "hold";
    }
    return "sell";
}

export async function runMockAnalysis(ticker: string, onStep?: StepCallback): Promise<AgentResponse> {
    onStep?.({ name: "planning", detail: `mock pipeline, ticker=${ticker.toUpperCase()}` });

    const newsTool = createNewsTool();
    const financialTool = createFinancialTool();

    onStep?.({ name: "called_news_tool", detail: `ticker=${ticker.toUpperCase()}` });
    const news = await newsTool.fetch(ticker);

    onStep?.({ name: "called_financial_tool", detail: `ticker=${ticker.toUpperCase()}` });
    const financial = await financialTool.fetch(ticker);

    onStep?.({
        name: "reflecting",
        detail: `news=${news.articles.length}, revenue_yoy=${financial.revenueYoyPercent}%`
    });

    const marketCapBillions: string = (financial.marketCap / 1_000_000_000).toFixed(0);
    const signal: Signal = decideSignal(financial.revenueYoyPercent);
    const confidence: number = calculateConfidence(news.articles, financial, signal);

    onStep?.({
        name: "confidence_check",
        detail: `signal=${signal}, confidence=${confidence}`
    });

    const analysis: AnalysisResult = {
        company: financial.company,
        thesis: `[MOCK] ${financial.company} shows ${financial.revenueYoyPercent}% YoY revenue growth with ${news.articles.length} recent news headlines. Profit margin is ${financial.profitMarginPercent}%, P/E is ${financial.peRatio}. This is a templated mock thesis built from real mock data, no AI was called.`,
        signal,
        confidence,
        insights: [
            `Revenue grew ${financial.revenueYoyPercent}% year over year`,
            `Market cap is approximately $${marketCapBillions}B`,
            `Profit margin is ${financial.profitMarginPercent}%`,
            ...news.articles.slice(0, 2).map(a => `${a.source}: ${a.title}`)
        ],
        sources: buildSources(news.articles, financial.revenueYoyPercent, marketCapBillions)
    };

    const rawText: string = JSON.stringify(analysis, null, 2);

    return {
        analysis,
        rawText,
        cost: 0,
        durationMs: 0
    };
}

function buildSources(
    articles: ReadonlyArray<{ title: string; url: string }>,
    revenueYoyPercent: number,
    marketCapBillions: string
): SourceRef[] {
    const sources: SourceRef[] = [];

    for (const article of articles.slice(0, 3)) {
        sources.push({ type: "news", title: article.title, url: article.url });
    }

    sources.push({ type: "financial", metric: "revenue_yoy_percent", value: `${revenueYoyPercent}%` });
    sources.push({ type: "financial", metric: "market_cap_usd", value: `${marketCapBillions}B` });

    return sources;
}
