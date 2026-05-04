import { randomUUID } from "node:crypto";
import { runMockAnalysis } from "../agent/mockAgent.js";
import { runRealAnalysis } from "../agent/realAgent.js";
import type { JobRecord, JobStatus, JobStepLog } from "../types/job.js";

class JobStore {
    private readonly Jobs: Map<string, JobRecord> = new Map();

    create(ticker: string, mode: "mock" | "real"): JobRecord {
        const id: string = randomUUID();
        const record: JobRecord = {
            id,
            ticker: ticker.trim().toUpperCase(),
            status: "pending",
            createdAt: new Date().toISOString(),
            steps: [],
            mode
        };
        this.Jobs.set(id, record);
        return record;
    }

    get(id: string): JobRecord | undefined {
        return this.Jobs.get(id);
    }

    list(): JobRecord[] {
        return Array.from(this.Jobs.values());
    }

    update(id: string, patch: Partial<JobRecord>): JobRecord | undefined {
        const existing = this.Jobs.get(id);
        if (!existing) {
            return undefined;
        }
        const updated: JobRecord = { ...existing, ...patch };
        this.Jobs.set(id, updated);
        return updated;
    }

    appendStep(id: string, step: JobStepLog): void {
        const existing = this.Jobs.get(id);
        if (!existing) {
            return;
        }
        existing.steps.push(step);
    }

    setStatus(id: string, status: JobStatus): void {
        this.update(id, { status });
    }
}

export const jobStore = new JobStore();

export function runAnalysisInBackground(jobId: string, ticker: string, useReal: boolean): void {
    void (async () => {
        const startedAt: string = new Date().toISOString();
        jobStore.update(jobId, { status: "running", startedAt });
        jobStore.appendStep(jobId, {
            name: "started",
            detail: `Mode: ${useReal ? "real" : "mock"}`,
            timestamp: startedAt
        });

        const onStep = (event: { name: string; detail?: string }): void => {
            jobStore.appendStep(jobId, {
                name: event.name,
                detail: event.detail,
                timestamp: new Date().toISOString()
            });
        };

        try {
            const response = useReal
                ? await runRealAnalysis(ticker, onStep)
                : await runMockAnalysis(ticker, onStep);

            const completedAt: string = new Date().toISOString();

            if (response.analysis) {
                jobStore.appendStep(jobId, {
                    name: "synthesized",
                    detail: `signal=${response.analysis.signal}, confidence=${response.analysis.confidence}`,
                    timestamp: completedAt
                });
                jobStore.update(jobId, {
                    status: "completed",
                    result: response.analysis,
                    rawText: response.rawText,
                    cost: response.cost,
                    durationMs: response.durationMs,
                    completedAt
                });
            } else {
                jobStore.update(jobId, {
                    status: "failed",
                    error: response.error ?? "Failed to produce analysis",
                    rawText: response.rawText,
                    cost: response.cost,
                    durationMs: response.durationMs,
                    completedAt
                });
            }
        } catch (error: unknown) {
            const message: string = error instanceof Error ? error.message : String(error);
            jobStore.update(jobId, {
                status: "failed",
                error: message,
                completedAt: new Date().toISOString()
            });
        }
    })();
}
