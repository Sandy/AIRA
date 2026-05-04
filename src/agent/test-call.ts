import "dotenv/config";
import { runMockAnalysis } from "./mockAgent.js";
import { runRealAnalysis } from "./realAgent.js";
import type { AgentResponse } from "./types.js";

async function main(): Promise<void> {
    const useReal: boolean = process.env.USE_REAL_AI === "true";
    const ticker: string = process.argv[2] || "AAPL";

    if (useReal && !process.env.ANTHROPIC_API_KEY) {
        console.error("ERROR: USE_REAL_AI=true but ANTHROPIC_API_KEY is not set in .env.");
        process.exit(1);
    }

    console.log(`Mode: ${useReal ? "REAL (Haiku + tools)" : "MOCK (templated, no API call)"}`);
    console.log(`Ticker: ${ticker}\n`);

    const response: AgentResponse = useReal
        ? await runRealAnalysis(ticker)
        : await runMockAnalysis(ticker);

    if (response.analysis === null) {
        console.log("FAILED to parse JSON. Raw output:");
        console.log(response.rawText);
        if (response.error) {
            console.log(`\nError: ${response.error}`);
        }
    } else {
        console.log("Analysis result:");
        console.log(JSON.stringify(response.analysis, null, 2));
    }

    console.log(`\nCost: $${response.cost.toFixed(6)}`);
    console.log(`Duration: ${response.durationMs} ms`);
}

main().catch((error: unknown) => {
    console.error("Error:", error);
    process.exit(1);
});
