export type Signal = "buy" | "sell" | "hold" | "avoid";

export interface SourceRef {
    type: string;
    title?: string;
    url?: string;
    metric?: string;
    value?: string;
}

export interface AnalysisResult {
    company: string;
    thesis: string;
    signal: Signal;
    confidence: number;
    insights: string[];
    sources: SourceRef[];
}

export interface AgentResponse {
    analysis: AnalysisResult | null;
    rawText: string;
    cost: number;
    durationMs: number;
    error?: string;
}

export interface AgentStepEvent {
    name: string;
    detail?: string;
}

export type StepCallback = (event: AgentStepEvent) => void;
