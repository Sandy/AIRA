import type { AnalysisResult } from "../agent/types.js";

export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface JobStepLog {
    name: string;
    detail?: string;
    timestamp: string;
}

export interface JobRecord {
    id: string;
    ticker: string;
    status: JobStatus;
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
    steps: JobStepLog[];
    result?: AnalysisResult;
    rawText?: string;
    error?: string;
    cost?: number;
    durationMs?: number;
    mode: "mock" | "real";
}
