## JobGent – LLM‑Powered Job Crawler & Recommender

End‑to‑end pipeline for discovering, crawling, extracting and recommending jobs using Tavily, Hugging Face models, LangGraph orchestration, and PostgreSQL + pgvector.

### Features
* Tavily search -> enqueue seed job board/listing URLs
* Crawler fetches HTML, LLM extracts structured job fields + more links
* Recursive domain‑restricted crawl with depth limit
* Hugging Face embeddings for jobs & user profiles
* Vector similarity (pgvector) + JS fallback
* Modular tools prepared for LangGraph state machine

### Tech Stack
Next.js (App Router) · Prisma · PostgreSQL (pgvector) · Hugging Face Inference · Tavily · Cheerio · LangGraph · Zod

---
## 1. Setup

Copy environment file:
```bash
cp .env.example .env
```
Fill in: DATABASE_URL, HUGGINGFACE_API_KEY, TAVILY_API_KEY.

Install dependencies:
```bash
pnpm install
```

Prisma generate & push (initial dev schema):
```bash
pnpm prisma:generate
pnpm prisma:push
```

Apply pgvector migration (if using raw migrations):
```bash
psql "$DATABASE_URL" -f prisma/migrations/0001_init_pgvector/migration.sql
```

Run dev server:
```bash
pnpm dev
```

---
## 2. Data Flow
1. POST /api/discover { prompt } -> seed CrawlQueue
2. POST /api/crawl -> processes one queued URL (repeat / schedule)
3. /api/discover-and-crawl combines (bootstrap + iterative crawl)
4. Embeddings generated asynchronously
5. /api/recommendations?userId=... returns ranked jobs

---
## 3. API Endpoints
| Method | Endpoint | Body / Query | Description |
| ------ | -------- | ------------ | ----------- |
| POST | /api/discover | { prompt, mode? } | Tavily discovery -> enqueue URLs. Set mode: 'single' or 'auto' (multi-query via LLM) |
| POST | /api/crawl | ?mode=loop | Process single next URL. With mode=loop, iterates until idle or cap |
| POST | /api/discover-and-crawl | { prompt, maxIterations?, multiDiscovery? } | Seed + iterative crawl loop; multiDiscovery uses LLM queries |
| GET | /api/jobs | q, take | List jobs (text filter) |
| POST | /api/user-profile | { name?, summary } | Create user profile + embedding |
| GET | /api/recommendations | userId, limit | Recommend jobs (JS cosine fallback) |

Chat UI:
- Navigate to /chat to interact with a lightweight LlamaIndex-style canvas. Prompts supported:
  - "discover <goal>" or "discover auto <goal>"
  - "crawl" or "run graph <goal>"
  - "list jobs [q:term]"

---
## 4. pgvector Integration
Migration adds column embedding_vector (vector(768)).
Embeddings stored both as JSON (Prisma) & pgvector (raw SQL update). For production remove JSON once fully migrated.

Similarity (PostgreSQL):
```sql
SELECT id, title, embedding_vector <=> $1 AS distance
FROM "Job"
ORDER BY embedding_vector <=> $1
LIMIT 10;
```
($1 is a vector literal: '[0.1,0.2,...]')

---
## 5. Orchestration
Currently uses a temporary manual loop (see src/lib/langgraph/graph.ts). Replace with StateGraph once stable typing: states: discover -> crawlOne (loop) -> end.

---
## 6. Environment Variables
| Name | Purpose |
| ---- | ------- |
| DATABASE_URL | PostgreSQL connection |
| HUGGINGFACE_API_KEY | HF Inference API key |
| HUGGINGFACE_EXTRACTION_MODEL | (optional) extraction model id |
| HUGGINGFACE_EMBEDDING_MODEL | (optional) embedding model id |
| TAVILY_API_KEY | Tavily Search key |
| CRAWL_MAX_DEPTH | Depth limit (default 2) |

---
## 7. Development Notes
* Depth + domain restriction applied when enqueueing new links.
* Basic retry logic (3 attempts) for HTML fetch.
* LLM JSON parsing is best‑effort; consider adding structured output guardrails.
* For large scale crawling add rate limiting, concurrency control, and persistent job scheduler.

---
## 8. Testing (Planned)
Add Vitest / Jest to cover:
* Discovery seeds queue
* Crawl adds Job records
* Embedding generation populates fields
* Recommendation ordering deterministic with mock vectors

---
## 9. Next Steps
* Full LangGraph StateGraph implementation
* Vector search endpoint (SQL cosine)
* User preference embedding refinement
* Robust logging & tracing (OpenTelemetry)
* Deduplication / canonicalization of jobs
* Continuous crawler daemon (cron or worker) calling POST /api/crawl?mode=loop

---
## 10. Disclaimer
Use responsibly; respect robots.txt and site ToS. Add politeness delays & caching before production.
