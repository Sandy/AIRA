export interface NewsArticle {
    title: string;
    source: string;
    publishedAt: string;
    summary: string;
    url: string;
}

export interface NewsToolResult {
    ticker: string;
    articles: NewsArticle[];
}

export interface FinancialMetrics {
    ticker: string;
    company: string;
    exchange: string;
    asOfDate: string;
    stockPrice: number;
    currency: string;
    marketCap: number;
    sharesOutstanding: number;
    revenueQuarterlyUsd: number;
    revenueYoyPercent: number;
    profitMarginPercent: number;
    peRatio: number;
    dividendYieldPercent: number;
    fiftyTwoWeekHigh: number;
    fiftyTwoWeekLow: number;
}

export interface NewsTool {
    fetch(ticker: string): Promise<NewsToolResult>;
}

export interface FinancialTool {
    fetch(ticker: string): Promise<FinancialMetrics>;
}
