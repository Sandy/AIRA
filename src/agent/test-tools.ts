import "dotenv/config";
import { createNewsTool, createFinancialTool } from "./tools/index.js";

async function main(): Promise<void> {
    const ticker: string = "AAPL";
    console.log(`Testing tools for ticker: ${ticker}\n`);

    const newsTool = createNewsTool();
    const financialTool = createFinancialTool();

    console.log("--- News Tool ---");
    const newsResult = await newsTool.fetch(ticker);
    console.log(`Articles found: ${newsResult.articles.length}`);
    for (const article of newsResult.articles) {
        console.log(`  - [${article.source}] ${article.title}`);
    }

    console.log("\n--- Financial Tool ---");
    const financial = await financialTool.fetch(ticker);
    console.log(`Company: ${financial.company} (${financial.exchange}: ${financial.ticker})`);
    console.log(`Stock Price: $${financial.stockPrice}`);
    console.log(`Market Cap: $${(financial.marketCap / 1_000_000_000).toFixed(0)}B`);
    console.log(`Revenue YoY: ${financial.revenueYoyPercent}%`);
    console.log(`Profit Margin: ${financial.profitMarginPercent}%`);
    console.log(`P/E Ratio: ${financial.peRatio}`);
    console.log(`As of: ${financial.asOfDate}`);

    console.log("\nDone.");
}

main().catch((error: unknown) => {
    console.error("Error:", error);
    process.exit(1);
});
