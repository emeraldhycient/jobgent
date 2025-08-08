
## 🧠 Project Prompt: Build an LLM‑Powered Job Crawler and Recommender System (with Tavily & Hugging Face)

### 🏗️ Project Overview

We’re building a **modular LLM‑powered job crawling and recommendation system**. The system will:

* Use **Tavily** for dynamic discovery of job listing URLs based on user‑defined roles.
* Crawl and parse job listings from any web page.
* Use a **Hugging Face‑hosted LLM** to extract job information and discover additional crawlable links.
* Generate **embeddings** for job descriptions (using Hugging Face models) to enable semantic search and personalized job recommendations.
* Optionally support auto‑apply mechanisms in the future.

### 🛠️ Stack

* `Next.js` for the frontend and backend orchestration.
* `Prisma + PostgreSQL` (with `pgvector`) for persistent storage and vector search.
* `LangGraph` for orchestrating tool flows and LLM reasoning.
* `Cheerio` for DOM extraction from HTML pages.
* `Tavily API` for initial seed URL discovery.
* **Hugging Face** for LLM inference and embeddings (we’ll start exclusively with Hugging Face; local Ollama integration can be considered later).

---

## 🔧 Core Functional Modules

### 0. 🌐 Initial Job Site Discovery (Tavily + LLM)

Before crawling starts:

* The LLM is given a job role prompt (e.g., *“Remote frontend developer jobs”*).
* It queries the **Tavily Search API** to retrieve relevant job board or job listing URLs.
* The LLM filters the results, retaining only URLs pointing to job boards or actual job listings.
* These URLs are inserted into the `CrawlQueue` as the initial seed set.

#### LangGraph Tool: `queryTavilyAndStoreUrls(prompt: string)`

* **Input:** A job search prompt.
* **Output:** A list of discovered job listing URLs stored in the crawl queue.

---

### 1. 🕷️ Crawler Engine (Cheerio + LangGraph)

* **Input:** List of URLs from the `CrawlQueue`.
* **Process:**

  * Fetch page HTML using Axios/Fetch.
  * Use `Cheerio` to extract the full DOM.
  * Send raw HTML and the URL to the LLM via LangGraph.
* **LLM Responsibilities:**

  * Extract structured job fields: **Title, Company, Location, Salary, Description, Requirements, Apply URL, Apply Instructions**.
  * Identify other crawlable links (e.g., pagination, related jobs).
* **Output:**

  * `jobs[]`: Structured job objects.
  * `nextUrls[]`: URLs for future crawling.

---

### 2. 🧠 LangGraph Tool Integration

Define tools for LangGraph to use:

* `storeJobData(job)`: Persist job data in Postgres via Prisma.
* `storeNextUrls(urls)`: Insert next crawlable URLs into `CrawlQueue`.
* `generateEmbeddingsAndStore(jobDescription)`: Generate and store embeddings in `pgvector` using Hugging Face.

---

### 3. 🧾 Job Storage Schema (Prisma + PostgreSQL)

```prisma
model Job {
  id           String   @id @default(uuid())
  title        String
  company      String
  location     String?
  salary       String?
  description  String
  requirements String?
  applyUrl     String
  applyMethod  String?
  sourceUrl    String
  embeddings   Vector   // pgvector column
  createdAt    DateTime @default(now())
}

model CrawlQueue {
  id              String   @id @default(uuid())
  url             String   @unique
  processed       Boolean  @default(false)
  discoveryMethod String?  // e.g., 'tavily', 'crawler', 'manual'
  createdAt       DateTime @default(now())
}
```

> ⚙️ Ensure the **pgvector** extension is enabled in PostgreSQL to store embeddings.

---

### 4. 🧩 Embeddings Generation (Hugging Face)

* Once a job is saved, generate an embedding from its `title + description + requirements`.
* **Models:** Hugging Face models such as `all-MiniLM-L6-v2`, `bge-small`, etc.
* Store the resulting vector in the `embeddings` column of the job record.

---

## 📦 Recommender (Post‑MVP)

After initial crawling is functional:

* Create a `UserProfile` model with a user embedding (e.g., based on CV or preferences).
* Use cosine similarity search to find relevant jobs:

  ```sql
  SELECT * FROM "Job" ORDER BY embeddings <-> $1 LIMIT 10
  ```

---

## 🔁 Crawling Strategy

1. **Bootstrap Phase (Tavily):**

   * Run prompt-based discovery via LLM → Tavily → Filtered URLs.
   * Store discovered URLs to `CrawlQueue`.

2. **Crawl Phase:**

   * Pick unprocessed URL from `CrawlQueue`.
   * Parse and extract job data and next links.
   * Store job + embeddings.
   * Store new links in queue.

3. **Loop:**

   * Continue crawl recursively within domain or depth limit.

---

## 🧪 API Routes

| Method | Endpoint                          | Description                              |
| ------ | --------------------------------- | ---------------------------------------- |
| `GET`  | `/api/jobs`                       | List all jobs (with filters)             |
| `POST` | `/api/crawl`                      | Trigger a manual crawl job               |
| `GET`  | `/api/recommendations?userId=xxx` | Recommend top‑N jobs for a user          |
| `POST` | `/api/discover`                   | Start initial discovery via Tavily + LLM |

---

## 🧠 LLM Setup

We’ll begin exclusively with **Hugging Face**:

* For extraction and reasoning: use a hosted instruction‑tuned model (e.g., `mistralai/Mixtral‑8x7B‑Instruct‑v0.1` or similar).
* For embeddings: use `all-MiniLM-L6-v2`, `bge-small`, or another Hugging Face embedding model.

> **Optional:** Support for running local models via Ollama can be considered in later phases, but is not in scope for the initial build.

---

## 📤 Sample LangGraph Prompt (HTML Extraction)

```
System:
You are an intelligent web extractor. Your task is to parse raw HTML and return structured JSON data for job listings.

User:
[HTML CONTENT]

Instructions:
1. Extract all job listings on the page.
2. For each job, return:
  - title, company, location, salary, description, requirements, applyUrl, applyMethod
3. Extract any additional URLs to crawl.

Return format:
{
  jobs: [...],
  nextUrls: [...]
}
```

---

## 📤 Sample LangGraph Prompt (Tavily Discovery)

```
System:
You are a job discovery assistant. You will query Tavily with a search prompt and extract relevant job board or job listing URLs.

User:
Prompt: "Remote data analyst job opportunities"

Instructions:
1. Use Tavily Search API with the given prompt.
2. Filter for URLs that link directly to job listings or job boards (no blogs or news).
3. Return only a clean array of URLs.

Return format:
{
  nextUrls: [...]
}
```

---

## ✅ Acceptance Criteria

* [ ] Tavily search integration working with the LLM.
* [ ] Tavily-derived URLs added to `CrawlQueue`.
* [ ] Cheerio + LangGraph crawler working correctly.
* [ ] Job data extracted and stored in PostgreSQL.
* [ ] Embeddings generated and stored using **Hugging Face**.
* [ ] API endpoints exposed for job browsing and recommendations.
* [ ] Full pipeline orchestrated via LangGraph.

---
