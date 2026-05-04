# A.I.R.A. - Autonomous Investment Research Agent

A backend service that analyzes a publicly traded company and produces a structured, evidence-based investment research report. Built with **TypeScript**, **Express**, and the **Claude Agent SDK**.

---

## What it does

1. You send a stock ticker (e.g. `AAPL`) to `POST /analyze`.
2. The server creates a job, returns a `job_id` immediately, and runs the analysis **in the background**.
3. The agent uses two tools (news + financial) to gather data, reflects on what it found, and produces a final research report.
4. You poll `GET /jobs/:id/status` until it shows `completed`.
5. You fetch the final structured JSON from `GET /jobs/:id/result`.

---

## Architecture

```
+----------+      +-------------------+      +------------------+
| Client   | ---> | Express HTTP API  | ---> | In-memory job    |
| (curl,   | <--- | (port 3000)       | <--- | store (Map)      |
|  Postman)|      +---------+---------+      +------------------+
+----------+                |                          ^
                            |  fire-and-forget         |
                            v                          |
                  +---------+--------+                 |
                  | Background runner |---- updates ---+
                  | (async function)  |
                  +---------+--------+
                            |
                            v
                  +---------+--------+
                  | Agent (mock or   |
                  | real Claude SDK) |
                  +---+--------+----+
                      |        |
              calls   |        |  calls
                      v        v
              +-------+--+ +---+-------+
              | News tool| | Financial |
              | (mock)   | | tool      |
              +----------+ | (mock)    |
                           +-----------+
```

### Folder layout

```
Aira-TypeScript/
├── src/
│   ├── server.ts                    Express entry point
│   ├── routes/
│   │   └── analysisRoutes.ts        POST /analyze, GET /jobs/:id/status, /result
│   ├── store/
│   │   └── jobs.ts                  In-memory job store + background runner
│   ├── types/
│   │   └── job.ts                   JobRecord, JobStatus
│   └── agent/
│       ├── types.ts                 AnalysisResult, AgentResponse
│       ├── mockAgent.ts             Templated mock analysis (no API call)
│       ├── realAgent.ts             Claude Agent SDK with MCP tools
│       ├── test-call.ts             CLI test script
│       ├── test-tools.ts            CLI tool test script
│       └── tools/
│           ├── types.ts             NewsTool, FinancialTool interfaces
│           ├── mockNewsTool.ts      Reads mock-data/news/{ticker}.json
│           ├── mockFinancialTool.ts Reads mock-data/financial/{ticker}.json
│           ├── index.ts             Factory: createNewsTool, createFinancialTool
│           └── aiToolDefinitions.ts MCP tool definitions for the agent
├── mock-data/
│   ├── news/AAPL.json
│   └── financial/AAPL.json
├── CLAUDE.md                        Agent system prompt
├── .env.example
├── package.json
└── tsconfig.json
```

---

## How to run

### Prerequisites

- Node.js 22 or later
- npm 10 or later

### Setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```
ANTHROPIC_API_KEY=sk-ant-api03-...    # only required if USE_REAL_AI=true
PORT=3000
USE_REAL_AI=false
USE_REAL_NEWS=false
USE_REAL_FINANCIAL=false
AIRA_MODEL=claude-haiku-4-5-20251001
```

### Run the server

```bash
npm run dev
```

You should see:

```
AIRA server listening on http://localhost:3000
Endpoints:
  GET  http://localhost:3000/health
  POST http://localhost:3000/analyze        body: { "ticker": "AAPL" }
  GET  http://localhost:3000/jobs/:id/status
  GET  http://localhost:3000/jobs/:id/result
  GET  http://localhost:3000/jobs            (list all jobs)
```

### CLI tests (no server needed)

```bash
npm run test:tools     # Verifies mock tools read JSON files correctly
npm run test:agent     # Runs a full analysis (mock by default, $0 cost)
```

You can pass a ticker:

```bash
npx tsx src/agent/test-call.ts TSLA
```

---

## Sample requests

See `requests.http` for ready-to-run examples (works with the VS Code REST Client extension).

### Quick PowerShell example

```powershell
$body = '{"ticker":"AAPL"}'
$r = Invoke-RestMethod -Uri "http://localhost:3000/analyze" -Method POST -Body $body -ContentType "application/json"
$r | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/jobs/$($r.job_id)/result" -Method GET | ConvertTo-Json -Depth 5
```

### Final JSON shape

```json
{
  "company": "Apple Inc.",
  "thesis": "...",
  "signal": "buy",
  "confidence": 0.7,
  "insights": [ "...", "..." ],
  "sources": [
    { "type": "news", "title": "...", "url": "..." },
    { "type": "financial", "metric": "revenue_yoy_percent", "value": "8.2%" }
  ]
}
```

---

## Agentic workflow

When the user calls `POST /analyze` with a ticker:

1. **Server** creates a job record with status `pending`, returns `job_id` immediately (non-blocking).
2. **Background runner** sets the job to `running` and calls either the mock or real agent.
3. **Mock agent** (`runMockAnalysis`):
   - Calls both tools directly to fetch real mock data.
   - Builds a templated thesis and signal from the data.
   - Returns the JSON instantly. Cost $0.
4. **Real agent** (`runRealAnalysis`):
   - Loads `CLAUDE.md` as the system prompt (overrides any user-level CLAUDE.md).
   - Registers `news_tool` and `financial_tool` as MCP tools the agent can call.
   - Asks Claude (Haiku by default) to analyze the ticker.
   - Claude decides on its own when to call which tool, may call multiple times, may reflect.
   - Final JSON is parsed from Claude's text response.
5. **Job store** is updated with the result (or error) and final timestamps.

### Why mock by default

Mocking everything (`USE_REAL_AI=false`, `USE_REAL_NEWS=false`, `USE_REAL_FINANCIAL=false`) means:

- Zero API cost while developing.
- Deterministic test data.
- Same agent code path, same JSON shape.
- Flip individual switches to test pieces in isolation.

---

## Design decisions

| Choice | Reason |
|---|---|
| Claude Agent SDK over raw Anthropic SDK | Built-in tool-use loop, MCP support, the same engine that powers Claude Code. Less boilerplate. |
| In-memory job store | Single-server Task project; no need for Redis or a database. Easy to swap later. |
| Fire-and-forget background runner | No queue infrastructure (RabbitMQ, BullMQ) for a Task project. Easy to swap to a queue later. |
| Mock-first development | Real APIs require credit and signup, slow down iteration. Mocks let the agent loop be tested for free. |
| Haiku as default model | 5-10x cheaper than Sonnet, fast enough for this kind of research. |
| Custom CLAUDE.md as system prompt | Bypasses user-level Claude Code prompt entirely, gives AIRA a clean financial-agent persona. |

---

## Trade-offs and known limitations

- **No persistence**: jobs are lost when the server restarts. A real deployment would use Redis or a database.
- **Single server only**: fire-and-forget cannot scale across machines. A queue (RabbitMQ, BullMQ) would be needed.
- **Mocked external data**: `mock-data/` contains static JSON for AAPL only. Real APIs (NewsAPI, Yahoo Finance) are stubbed for future work.
- **No authentication**: anyone with network access can call the API. Real deployments need API keys or OAuth.
- **No rate limiting or caching**: every call to a real Anthropic / news API hits the wire. Add a short-TTL cache before going live.
- **JSON parsing fallback is best-effort**: if Claude wraps the response in markdown fences or adds extra text, `tryParseAnalysis` strips and parses; on failure, `analysis` is `null` and `error` describes the issue.


---

