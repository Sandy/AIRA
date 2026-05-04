import type { NewsArticle, FinancialMetrics } from "./tools/types.js";
import type { Signal } from "./types.js";

export function calculateConfidence(
    articles: ReadonlyArray<NewsArticle>,
    financial: FinancialMetrics,
    signal: Signal
): number {
    const newsScore: number = Math.min(articles.length / 5, 1.0);

    const newestPublishedAt: string | undefined = articles[0]?.publishedAt;
    const daysSinceNewest: number = newestPublishedAt
        ? (Date.now() - new Date(newestPublishedAt).getTime()) / (1000 * 60 * 60 * 24)
        : 999;
    const recencyScore: number = daysSinceNewest <= 30 ? 1.0 : (daysSinceNewest <= 90 ? 0.5 : 0.2);

    const dataCompletenessScore: number =
        (financial.revenueQuarterlyUsd > 0 ? 0.5 : 0) +
        (financial.peRatio > 0 ? 0.25 : 0) +
        (financial.marketCap > 0 ? 0.25 : 0);

    const coherenceScore: number =
        (signal === "buy" && financial.revenueYoyPercent > 5) ? 1.0 :
        (signal === "sell" && financial.revenueYoyPercent < 0) ? 1.0 :
        (signal === "hold") ? 0.7 :
        0.5;

    const weighted: number =
        newsScore * 0.25 +
        recencyScore * 0.25 +
        dataCompletenessScore * 0.25 +
        coherenceScore * 0.25;

    return Math.round(weighted * 100) / 100;
}
