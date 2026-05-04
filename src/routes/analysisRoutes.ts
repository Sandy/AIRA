import { Router, Request, Response } from "express";
import { jobStore, runAnalysisInBackground } from "../store/jobs.js";
import { runMockAnalysis } from "../agent/mockAgent.js";
import { runRealAnalysis } from "../agent/realAgent.js";

interface AnalyzeRequestBody {
    ticker?: unknown;
}

export const analysisRouter: Router = Router();

analysisRouter.post("/analyze", (req: Request, res: Response) => {
    const body = req.body as AnalyzeRequestBody;
    const tickerRaw: unknown = body?.ticker;

    if (typeof tickerRaw !== "string" || tickerRaw.trim().length === 0) {
        res.status(400).json({ error: "Body must include a non-empty 'ticker' string." });
        return;
    }

    const useReal: boolean = process.env.USE_REAL_AI === "true";
    const job = jobStore.create(tickerRaw, useReal ? "real" : "mock");

    runAnalysisInBackground(job.id, tickerRaw, useReal);

    res.status(202).json({
        job_id: job.id,
        status: job.status,
        ticker: job.ticker,
        mode: job.mode,
        createdAt: job.createdAt
    });
});

analysisRouter.get("/jobs/:id/status", (req: Request, res: Response) => {
    const id: string = String(req.params.id);
    const job = jobStore.get(id);

    if (!job) {
        res.status(404).json({ error: "Job not found." });
        return;
    }

    res.json({
        job_id: job.id,
        ticker: job.ticker,
        status: job.status,
        mode: job.mode,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        steps: job.steps,
        error: job.error
    });
});

analysisRouter.get("/jobs/:id/result", (req: Request, res: Response) => {
    const id: string = String(req.params.id);
    const job = jobStore.get(id);

    if (!job) {
        res.status(404).json({ error: "Job not found." });
        return;
    }

    if (job.status === "pending" || job.status === "running") {
        res.status(409).json({
            error: "Job not yet completed. Poll /jobs/:id/status until status is 'completed'.",
            status: job.status
        });
        return;
    }

    if (job.status === "failed") {
        res.status(500).json({
            job_id: job.id,
            ticker: job.ticker,
            status: job.status,
            error: job.error,
            rawText: job.rawText
        });
        return;
    }

    res.json({
        job_id: job.id,
        ticker: job.ticker,
        status: job.status,
        mode: job.mode,
        ...job.result,
        cost: job.cost,
        durationMs: job.durationMs,
        completedAt: job.completedAt
    });
});

analysisRouter.get("/jobs", (_req: Request, res: Response) => {
    const all = jobStore.list().map((job) => ({
        job_id: job.id,
        ticker: job.ticker,
        status: job.status,
        mode: job.mode,
        createdAt: job.createdAt,
        completedAt: job.completedAt
    }));
    res.json({ count: all.length, jobs: all });
});

analysisRouter.get("/analyze/stream", async (req: Request, res: Response) => {
    const tickerRaw: unknown = req.query.ticker;

    if (typeof tickerRaw !== "string" || tickerRaw.trim().length === 0) {
        res.status(400).json({ error: "Query parameter 'ticker' is required." });
        return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const sendEvent = (eventName: string, data: unknown): void => {
        res.write(`event: ${eventName}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const useReal: boolean = process.env.USE_REAL_AI === "true";
    const ticker: string = tickerRaw.trim().toUpperCase();

    sendEvent("start", { ticker, mode: useReal ? "real" : "mock", startedAt: new Date().toISOString() });

    const onStep = (event: { name: string; detail?: string }): void => {
        sendEvent("step", { ...event, timestamp: new Date().toISOString() });
    };

    try {
        const response = useReal
            ? await runRealAnalysis(tickerRaw, onStep)
            : await runMockAnalysis(tickerRaw, onStep);

        if (response.analysis) {
            sendEvent("result", response.analysis);
            sendEvent("done", {
                cost: response.cost,
                durationMs: response.durationMs,
                completedAt: new Date().toISOString()
            });
        } else {
            sendEvent("failed", {
                error: response.error ?? "Unknown error",
                rawText: response.rawText
            });
        }
    } catch (error: unknown) {
        const message: string = error instanceof Error ? error.message : String(error);
        sendEvent("failed", { error: message });
    } finally {
        res.end();
    }
});
