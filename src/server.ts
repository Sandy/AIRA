import "dotenv/config";
import express, { Request, Response } from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { analysisRouter } from "./routes/analysisRoutes.js";

const CURRENT_FILE: string = fileURLToPath(import.meta.url);
const CURRENT_DIR: string = dirname(CURRENT_FILE);
const PUBLIC_DIR: string = join(CURRENT_DIR, "..", "public");

const PORT: number = Number(process.env.PORT) || 3000;
const app = express();

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

app.get("/health", (_req: Request, res: Response) => {
    res.json({
        status: "ok",
        service: "aira",
        mode: process.env.USE_REAL_AI === "true" ? "real-ai" : "mock-ai",
        timestamp: new Date().toISOString()
    });
});

app.use("/", analysisRouter);

app.listen(PORT, () => {
    console.log(`AIRA server listening on http://localhost:${PORT}`);
    console.log("Endpoints:");
    console.log(`  GET  http://localhost:${PORT}/health`);
    console.log(`  POST http://localhost:${PORT}/analyze              body: { "ticker": "AAPL" }`);
    console.log(`  GET  http://localhost:${PORT}/jobs/:id/status`);
    console.log(`  GET  http://localhost:${PORT}/jobs/:id/result`);
    console.log(`  GET  http://localhost:${PORT}/jobs                 (list all jobs)`);
    console.log(`  GET  http://localhost:${PORT}/analyze/stream?ticker=AAPL  (SSE stream)`);
    console.log(`  GET  http://localhost:${PORT}/stream-test.html      (browser demo)`);
});
