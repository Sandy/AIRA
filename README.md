# A.I.R.A. — Autonomous Investment Research Agent

> Submission for the **InVitro Capital** case study (timebox: up to 24 hours).
>
> A backend service that takes a publicly traded company's ticker, runs a multi-step autonomous AI agent in the background, and returns a structured, evidence-based investment research report in machine-readable JSON.

---

## TL;DR for the reviewer

| Aspect | Status |
|---|---|
| All **required** core expectations | ✅ Met |
| **Optional bonus** items completed | Confidence scoring with sanity cap, observable agent steps (named + timestamped), live **SSE** stream of agent reasoning |
| Stack | TypeScript, Node.js 22, Express 5, Claude Agent SDK (MCP tools), Zod |
| Data sources | Mocked JSON (allowed by the case study). Real API integration is stubbed behind feature flags. |
| Tested in | Mock mode end-to-end + one paid real Claude Haiku run for verification |
| Quick run command | `npm install && npm run dev` |

If you want to skip ahead, jump to [Quick start](#quick-start) or [How requirements map to code](#how-requirements-map-to-code).

---

## Quick start

### Prerequisites
- **Node.js 22+** and **npm 10+**
- An **Anthropic API key** (only required if you want to run the *real* agent; the project runs in **full mock mode** by default at $0 cost)

### Steps

```bash
# 1. install
npm install

# 2. create your local config from the template
cp .env.example .env
# Open .env and (optionally) paste your ANTHROPIC_API_KEY.
# Defaults are safe: USE_REAL_AI=false means $0 cost.

# 3. run
npm run dev
```

You will see:

```
AIRA server listening on http://localhost:3000
Endpoints:
  GET  /health
  POST /analyze              body: { "ticker": "AAPL" }
  GET  /jobs/:id/status
  GET  /jobs/:id/result
  GET  /jobs                          (list all jobs)
  GET  /analyze/stream?ticker=AAPL    (SSE stream)
  GET  /stream-test.html              (browser demo page)
```

### Try it (PowerShell)

```powershell
$r = Invoke-RestMethod -Uri "http://localhost:3000/analyze" -Method POST `
    -Body '{"ticker":"AAPL"}' -ContentType "application/json"
Invoke-RestMethod -Uri "http://localhost:3000/jobs/$($r.job_id)/result" | ConvertTo-Json -Depth 5
```

### Try the live SSE stream (browser, recommended)

Open `http://localhost:3000/stream-test.html`, type a ticker, click **Analyze**. Each agent step appears in real time.

### Try without the HTTP server (CLI)

```bash
npm run test:agent          # full analysis (mock by default)
npm run test:tools          # verifies the data tools alone
npx tsx src/agent/test-call.ts AAPL
```

### Switch to the real Claude agent

Edit `.env`:

```
USE_REAL_AI=true
```

Restart the server. One real run typically costs **$0.05–$0.10** with Haiku as configured.

---

## What was built and why

The case study describes an **autonomous multi-step agent** with **multiple data sources** behind an **async backend**. AIRA implements that as five collaborating layers:

1. **HTTP API** (`Express`) — accepts requests, exposes status, returns the final JSON, and offers an **SSE stream** of live agent steps for observability.
2. **Async job runner** — `POST /analyze` returns a `job_id` immediately; analysis runs in a background async function, the job state lives in an in-memory `Map`.
3. **Two mock data tools** behind interchangeable interfaces — one for **news (unstructured)** and one for **financial metrics (structured)**, both reading static JSON to keep the demo deterministic and free.
4. **Two agent implementations behind one `AgentResponse` contract**:
   - **Mock agent** — calls the tools directly, builds a templated thesis, computes a confidence score from data quality. Useful for fast iteration with $0 cost.
   - **Real agent** — uses the **Claude Agent SDK**. Tools are exposed via **MCP** (Model Context Protocol). The agent itself decides when to call which tool, in what order, and how many times. Output JSON is parsed and confidence is **sanity-capped** against our own computed value.
5. **Custom system prompt** (`CLAUDE.md`) — gives AIRA a clean financial-research persona and **bypasses any user-level Claude Code instructions** that the SDK would otherwise inherit.

Every required JSON key is produced (`company`, `thesis`, `signal`, `insights`, `sources`) plus a `confidence` extension.

---

## Architecture

### Layered view

```
+---------+      +-----------------------+      +-----------------+
| Client  | ---> | Express HTTP API      | ---> | In-memory job   |
| (curl,  | <--- | port 3000             | <--- | store (Map)     |
|  Postman|      | + SSE /analyze/stream |      |                 |
|  browser)      +-----------+-----------+      +--------+--------+
+---------+                  |                           ^
                             |  fire-and-forget          |
                             v                           | step / result
                   +---------+----------+                | updates
                   | Background runner   |---------------+
                   | (async function)    |
                   +---------+----------+
                             |
                             v
                +------------+--------------+
                | Agent (mock OR real Claude)|
                | runMockAnalysis            |
                | runRealAnalysis            |
                +-----+----------------+----+
                      |                |
              calls   |                |  calls
                      v                v
              +-------+----+   +-------+--------+
              | News tool  |   | Financial tool |
              | (mock JSON)|   | (mock JSON)    |
              +------------+   +----------------+
```

### Sequence: a single `POST /analyze` request

```
Client            API server         Job store         Background runner       Agent (mock/real)        Tools
  |                  |                  |                       |                       |                  |
  |--POST /analyze-->|                  |                       |                       |                  |
  |                  |---create job---->|                       |                       |                  |
  |                  |<--{job_id}-------|                       |                       |                  |
  |<--202 job_id-----|                  |                       |                       |                  |
  |                  |---fire&forget--->|                       |                       |                  |
  |                  |                  |   set status=running  |                       |                  |
  |                  |                  |<--append "started"----|                       |                  |
  |                  |                  |<--append "planning"---|---run analysis------->|                  |
  |                  |                  |                       |                       |--news_tool------>|
  |                  |                  |<--append "called_news_tool"-------------------|<--articles-------|
  |                  |                  |                       |                       |--financial_tool->|
  |                  |                  |<--append "called_financial_tool"--------------|<--metrics--------|
  |                  |                  |<--append "reflecting"-|                       |                  |
  |                  |                  |<--append "confidence_check"-------------------|                  |
  |                  |                  |<--append "synthesized"|<--AgentResponse-------|                  |
  |                  |                  |   set status=completed|                       |                  |
  |                  |                  |   save result         |                       |                  |
  |                  |                  |                       |                       |                  |
  |--GET status----->|---read----->| ...returns steps[]                                                    |
  |--GET result----->|---read----->| ...returns full AnalysisResult JSON                                   |
```

For the **SSE endpoint** (`GET /analyze/stream?ticker=AAPL`), the same sequence runs but the same step events are pushed live to the client over a single HTTP connection (no polling).

### Folder layout

```
AIRA/
├── src/
│   ├── server.ts                    Express entry point
│   ├── routes/
│   │   └── analysisRoutes.ts        REST + SSE endpoints
│   ├── store/
│   │   └── jobs.ts                  In-memory job store + background runner
│   ├── types/
│   │   └── job.ts                   JobRecord, JobStepLog
│   └── agent/
│       ├── types.ts                 AnalysisResult, AgentResponse, StepCallback
│       ├── confidence.ts            Shared confidence formula
│       ├── mockAgent.ts             Templated mock analysis ($0 cost)
│       ├── realAgent.ts             Claude Agent SDK + MCP tools + JSON parser
│       ├── test-call.ts             CLI test entrypoint
│       ├── test-tools.ts            CLI tool verification
│       └── tools/
│           ├── types.ts             NewsTool, FinancialTool interfaces
│           ├── mockNewsTool.ts      Reads mock-data/news/{ticker}.json
│           ├── mockFinancialTool.ts Reads mock-data/financial/{ticker}.json
│           ├── index.ts             Factory: createNewsTool / createFinancialTool
│           └── aiToolDefinitions.ts MCP tool definitions for the agent
├── public/
│   └── stream-test.html             Browser page that consumes the SSE stream
├── mock-data/
│   ├── news/AAPL.json
│   └── financial/AAPL.json
├── CLAUDE.md                        Agent system prompt
├── .env.example
├── requests.http                    VS Code REST Client examples
├── package.json
├── tsconfig.json
└── README.md
```

### Module dependency rule

```
routes  --->  store  --->  agent  --->  tools
                                |
                                +--->  confidence
```

Inner modules know nothing about outer modules. `agent` does not import from `routes`. `tools` do not import from `agent`. This keeps the agent code testable in isolation and lets us swap the HTTP layer (or add a queue) without touching the brain.

---

## Agentic workflow

For each `POST /analyze` (or SSE call):

1. The server creates a **job record** (`status: pending`), returns the `job_id` immediately. The user is never blocked.
2. The **background runner** flips the job to `running` and starts emitting step events.
3. **The agent runs**:
   - **Mock agent**: calls news tool → calls financial tool → reflects → computes confidence → synthesizes templated thesis. Useful for development.
   - **Real agent**: pre-fetches reference data for confidence checks; loads `CLAUDE.md` as the system prompt; registers `news_tool` and `financial_tool` as **MCP tools**; calls Claude Haiku via the Agent SDK; parses the JSON response; **caps `confidence`** at the lower of Claude's number and ours, so the agent cannot inflate how sure it is.
4. Each step (`planning`, `called_news_tool`, `called_financial_tool`, `reflecting`, `confidence_check`, `synthesized`) is **named, timestamped, and stored** on the job and **streamed live over SSE**.
5. The final `AnalysisResult` lands in the job store. `GET /jobs/:id/result` returns it.

A real run looks like (Apple, Haiku, $0.07):

```
START   {"ticker":"AAPL","mode":"real"}
STEP    planning              model=claude-haiku-4-5..., ticker=AAPL
STEP    called_news_tool      {"ticker":"AAPL"}
STEP    called_financial_tool {"ticker":"AAPL"}
STEP    confidence_check      claude=0.62, computed=0.88, final=0.62
RESULT  { full AIRA JSON }
DONE    cost=$0.0685, durationMs=12683
```

---

## API reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Service ping with current mode (mock or real) |
| `POST` | `/analyze` | Body `{ticker}`. Returns `{job_id, status}`. Async. |
| `GET` | `/jobs/:id/status` | Status + named, timestamped step log |
| `GET` | `/jobs/:id/result` | Final analysis JSON. 409 while running. |
| `GET` | `/jobs` | Debug helper to list all jobs |
| `GET` | `/analyze/stream?ticker=...` | SSE stream of live agent events (`start`, `step`, `result`, `done`, `failed`) |
| `GET` | `/stream-test.html` | Browser page that consumes the SSE stream visually |

### Final JSON shape

```json
{
  "company": "Apple Inc.",
  "thesis": "...",
  "signal": "buy" | "sell" | "hold" | "avoid",
  "confidence": 0.62,
  "insights": [ "...", "..." ],
  "sources": [
    { "type": "news",      "title": "...", "url": "..." },
    { "type": "financial", "metric": "revenue_yoy_percent", "value": "8.2%" }
  ]
}
```

---

## How requirements map to code

| Case study requirement | Where it lives |
|---|---|
| Runnable backend service | `src/server.ts`, `npm run dev` |
| Async execution | `src/store/jobs.ts` `runAnalysisInBackground` |
| Status check + result fetch | `src/routes/analysisRoutes.ts` |
| Structured JSON output | `src/agent/types.ts` `AnalysisResult` + `tryParseAnalysis` |
| Externalized config | `.env` + `.env.example` (`USE_REAL_*`, `ANTHROPIC_API_KEY`, model id) |
| Multi-step agent | `runRealAnalysis` uses the Claude Agent SDK with MCP tools |
| Decide what info is needed | The agent itself; tool calls are not hardcoded |
| Multiple data sources | `news_tool` (unstructured) + `financial_tool` (structured) |
| Combine structured + unstructured | Both flow into the agent's context |
| Adapt next steps | Agent SDK loop; Claude can call tools 0..N times in any order |
| Planning / decomposition | First `planning` step + the agent's autonomous tool plan |
| Information gathering | `called_news_tool`, `called_financial_tool` steps |
| Synthesis & reasoning | `synthesized` step; final JSON with thesis + signal + insights |
| Observable intermediate steps | Job `steps[]` (name, detail, timestamp) + **live SSE stream** |
| Sample payloads (mocked data) | `mock-data/news/AAPL.json`, `mock-data/financial/AAPL.json` |
| **Bonus** confidence / uncertainty | `src/agent/confidence.ts` + sanity cap in `runRealAnalysis` |

---

## Design decisions (and why)

| Choice | Reason |
|---|---|
| TypeScript + Express | Clean, typed, familiar; the Claude Agent SDK is officially TypeScript / Python only. |
| Claude Agent SDK over the raw Anthropic SDK | First-class tool-use loop and **MCP** support; less boilerplate; the same engine that powers Claude Code. |
| MCP for the data tools | Lets the agent declare its own tool plan instead of being driven by hand-coded if/else. Real agentic behavior. |
| Custom `CLAUDE.md` injected as `systemPrompt` (string) | Bypasses any user-level Claude Code instructions the SDK would otherwise inherit, and gives AIRA a clean financial-agent persona. |
| Haiku as default model | 5–10x cheaper than Sonnet, fast enough for this kind of structured research. Easy to switch via `AIRA_MODEL`. |
| Mock-first development with feature flags | Real APIs need credit and signup; mocks let the agent loop be developed and demoed at $0 cost. Each layer (AI / news / financial) has its own switch. |
| In-memory job store | Single-server submission; no Redis/SQL needed for the timebox. Behind a small `JobStore` class so it can be swapped. |
| Fire-and-forget Promise for the background runner | Lighter than a queue (RabbitMQ/BullMQ) for the timebox while preserving the right async boundary. The runner is one function, easy to replace. |
| **Sanity-capped confidence** (`min(claude, computed)`) | The agent cannot claim 0.95 when our own data quality scoring says 0.40. Defensive bonus on top of the case study's optional confidence requirement. |
| **SSE in addition to polling** | Polling satisfies the literal case study spec; SSE adds live observability and demo-ability without removing polling. |
| Keep `dist/` and `node_modules/` out of git | Standard Node hygiene; reproducibility comes from `package-lock.json`. |
| `.env` excluded from the repo | API keys never enter git history. |

---

## Time-box trade-offs (what I chose to skip and why)

This was built within the case study's 24-hour timebox. The case study explicitly says **"We value clarity and judgment over completeness"**, so I optimized for a **clean, demonstrable core** rather than feature breadth.

**Deliberately skipped:**
- **Real news / financial APIs** — kept the data layer behind interchangeable interfaces with `USE_REAL_NEWS` / `USE_REAL_FINANCIAL` flags ready, but did not integrate `NewsAPI`, Alpha Vantage, or Yahoo Finance to avoid signup, key management, and rate-limit handling within the timebox.
- **Persistent job storage (Redis / SQL)** — `Map`-based store is enough for a single-process demo. The store is wrapped behind a small class so it can be replaced without touching agent code.
- **Distributed worker / queue (RabbitMQ / BullMQ)** — fire-and-forget is sufficient for one process. The runner is one function, trivially replaceable.
- **Authentication and rate limiting** — the case study did not require them; production would obviously need both.
- **Retries with exponential backoff** — the agent SDK already retries transient network failures; explicit per-tool retry was deferred.
- **Caching of tool responses** — listed as advanced/optional; not built but the seam exists in the tool interfaces.
- **Automated tests** — manual end-to-end runs (mock + one paid real run) covered correctness for the timebox; a Vitest harness for `tryParseAnalysis`, the confidence formula, and the job store would be the first thing I add next.
- **Recurring / proactive analysis** — listed as advanced/optional; not in scope for one ticker.

**Deliberately kept:**
- Clean separation of concerns (`agent` / `store` / `routes` / `tools`).
- Feature flags for *every* swappable layer (AI, news, financial).
- Strong observability: named, timestamped steps + live SSE stream.
- A confidence number that the agent cannot inflate.

---

## Production next steps

If this graduated from a case study to a real service, the priority order would be:

1. **Real data sources**
   - Replace `MockNewsTool` with a NewsAPI / GNews / Bing News integration; honor `USE_REAL_NEWS`.
   - Replace `MockFinancialTool` with Alpha Vantage / Finnhub / Yahoo Finance; honor `USE_REAL_FINANCIAL`.
   - Add per-tool retries with backoff and a small in-memory + Redis cache (5-15 minute TTL).
2. **Persistence**
   - Move `JobStore` from `Map` to **Redis** (or PostgreSQL) so jobs survive restarts and are visible to multiple API instances.
3. **Distributed worker**
   - Replace fire-and-forget with **BullMQ** (Redis-based) or **RabbitMQ**. The HTTP layer enqueues; a worker process consumes. Enables horizontal scaling and survives crashes mid-job.
4. **Hardening**
   - API auth (API keys per client, JWT for users).
   - Rate limiting (per IP and per API key).
   - Structured logging (Pino) + request correlation IDs.
   - Health/readiness/liveness probes.
   - Per-call cost cap and per-tenant spend limits.
5. **Reliability of the agent loop**
   - Max-turn limit on Claude tool-use.
   - JSON schema validation on the parsed analysis (Zod).
   - Self-correction: if confidence < threshold or required fields missing, re-prompt once with the gap.
6. **Observability**
   - OpenTelemetry traces around tool calls and the agent loop.
   - Persist `steps[]` to the database for analytics ("which tickers fail most?").
7. **Testing**
   - Vitest unit tests for `tryParseAnalysis`, `calculateConfidence`, the JobStore state machine.
   - Contract tests for each tool implementation against its interface.
   - One end-to-end test in mock mode hitting all three endpoints.
8. **Deployment**
   - Dockerfile + a small `docker-compose.yml` (api + worker + redis).
   - CI: type-check, build, unit tests, mock-mode E2E.

---

## License

MIT (or whatever the reviewer prefers — please let me know if a different license is required).
