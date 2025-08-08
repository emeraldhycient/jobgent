import axios from 'axios';
import * as cheerio from 'cheerio';
import { prisma } from '@/lib/prisma';
import { HfInference } from '@huggingface/inference';
import { TavilyClient } from 'tavily';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';

function getHf() {
  return new HfInference(process.env.HUGGINGFACE_API_KEY || '');
}

function getTavily() {
  const key = process.env.TAVILY_API_KEY;
  return new TavilyClient({ apiKey: key || '' });
}

export const JobExtractionResultSchema = z.object({
  jobs: z.array(z.object({
    title: z.string().min(1),
    company: z.string().optional().default(''),
    location: z.string().optional().nullable(),
    salary: z.string().optional().nullable(),
    description: z.string().min(1),
    requirements: z.string().optional().nullable(),
    applyUrl: z.string().url().optional().nullable(),
    applyMethod: z.string().optional().nullable(),
    sourceUrl: z.string().url().optional().nullable()
  })).default([]),
  nextUrls: z.array(z.string().url()).default([])
});
export type JobExtractionResult = z.infer<typeof JobExtractionResultSchema>;

// Enhanced domain extraction with subdomain support
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.toLowerCase();
  } catch {
    return 'unknown';
  }
}

// Improved job extraction with better prompting
async function extractJobsFromHtml(html: string, sourceUrl: string) {
  const maxHtmlLength = 50000; // Limit HTML size for LLM
  const truncatedHtml = html.length > maxHtmlLength ? 
    html.substring(0, maxHtmlLength) + '...' : html;

  const extractionPrompt = `
You are an expert job data extractor. Analyze the HTML content and extract ALL job listings.

HTML Content:
${truncatedHtml}

Source URL: ${sourceUrl}

Instructions:
1. Extract ALL job listings found on this page
2. For each job, extract these fields (use null if not found):
   - title: Job title
   - company: Company name
   - location: Job location (city, state, remote, etc.)
   - salary: Salary range or amount
   - description: Full job description
   - requirements: Required skills/qualifications
   - applyUrl: Direct application URL
   - applyMethod: How to apply (email, online form, etc.)

3. Also find pagination or "next page" URLs for continued crawling
4. Only include URLs from the same domain or related job boards

Return ONLY valid JSON in this exact format:
{
  "jobs": [
    {
      "title": "string",
      "company": "string", 
      "location": "string",
      "salary": "string",
      "description": "string",
      "requirements": "string",
      "applyUrl": "string",
      "applyMethod": "string"
    }
  ],
  "nextUrls": ["url1", "url2"]
}`;

  try {
    const response = await getHf().textGeneration({
      model: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
      inputs: extractionPrompt,
      parameters: {
        max_new_tokens: 2000,
        temperature: 0.1,
        return_full_text: false
      }
    });

    const jsonMatch = response.generated_text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in LLM response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return JobExtractionResultSchema.parse(parsed);
  } catch (error) {
    console.error('Job extraction failed:', error);
    return { jobs: [], nextUrls: [] } as JobExtractionResult;
  }
}

// Tavily search result type
type TavilyResult = { url?: string; link?: string };

// Improved Tavily discovery with better filtering
export async function queryTavilyAndStoreUrls(prompt: string) {
  try {
    console.log(`🔍 Discovering URLs for: "${prompt}"`);
    
    // Enhanced search query for better job site targeting
    const enhancedPrompt = `${prompt} site:linkedin.com OR site:indeed.com OR site:glassdoor.com OR site:monster.com OR site:ziprecruiter.com OR job listings career opportunities`;
    
    const tavily = getTavily();
    const results = await tavily.search({ query: enhancedPrompt, max_results: 10 });
    const searchResults = (results.results as unknown as TavilyResult[]) || [];
    
    if (!Array.isArray(searchResults)) {
      throw new Error('Invalid Tavily response format');
    }

    // Filter and validate URLs
    const validUrls = searchResults
      .filter(result => {
        const url = result.url || result.link;
        if (!url) return false;
        
        // Filter out non-job related domains
        const domain = extractDomain(url);
        const jobDomains = ['linkedin.com', 'indeed.com', 'glassdoor.com', 'monster.com', 
                           'ziprecruiter.com', 'workday.com', 'greenhouse.io', 'lever.co'];
        
        return jobDomains.some(jobDomain => domain.includes(jobDomain)) ||
               url.toLowerCase().includes('job') || 
               url.toLowerCase().includes('career');
      })
      .map(result => (result.url || result.link)!)
      .filter(Boolean);

    // Store unique URLs in queue
    const storedUrls: string[] = [];
    for (const url of [...new Set(validUrls)]) {
      try {
        await prisma.crawlQueue.upsert({
          where: { url },
          update: {},
          create: {
            url,
            discoveryMethod: 'tavily',
            domain: extractDomain(url),
            depth: 0
          }
        });
        storedUrls.push(url);
      } catch (error) {
        console.warn(`Failed to store URL ${url}:`, (error as Error).message);
      }
    }

    const queueCount = await prisma.crawlQueue.count({
      where: { processed: false }
    });

    console.log(`✅ Stored ${storedUrls.length} URLs, ${queueCount} total in queue`);
    
    return {
      urls: storedUrls,
      queueCount,
      totalFound: validUrls.length
    };
  } catch (error) {
    console.error('Tavily discovery failed:', error);
    throw new Error(`Discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Enhanced queue processor with retry logic
export async function processNextInQueue(maxDepth = Number(process.env.CRAWL_MAX_DEPTH || 2), maxRetries = 3) {
  const whereClause = { processed: false } as { processed: boolean; depth?: { lte: number } };
  whereClause.depth = { lte: maxDepth };
  const queueItem = await prisma.crawlQueue.findFirst({ 
    where: whereClause,
    orderBy: [
      { depth: 'asc' }, // Process shallow items first
      { createdAt: 'asc' }
    ]
  });

  if (!queueItem) {
    return { status: 'idle' as const, remaining: 0 };
  }

  // Check depth limit
  if ((queueItem as unknown as { depth?: number }).depth! >= 3) {
    await prisma.crawlQueue.update({
      where: { id: queueItem.id },
      data: { processed: true }
    });
    
    const remaining = await prisma.crawlQueue.count({
      where: { processed: false }
    });
    
    return { status: 'skipped' as const, remaining };
  }

  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🕷️ Crawling ${queueItem.url} (attempt ${attempt})`);
      
      const response = await axios.get(queueItem.url, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; JobBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        maxRedirects: 5
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}`);
      }

      const $ = cheerio.load(response.data);
      
      // Remove script and style tags for cleaner extraction
      $('script, style, nav, footer, header, .advertisement').remove();
      const cleanHtml = $.html();

      const extracted = await extractJobsFromHtml(cleanHtml, queueItem.url);
      
      // Store jobs
      const storedJobs: Array<{ id: string } & Record<string, unknown>> = [];
      for (const jobData of extracted.jobs || []) {
        if (!jobData.title || !jobData.company) continue;
        
        try {
          const job = await prisma.job.create({
            data: {
              title: jobData.title,
              company: jobData.company,
              location: jobData.location || '',
              salary: jobData.salary || '',
              description: jobData.description || '',
              requirements: jobData.requirements || '',
              applyUrl: jobData.applyUrl || queueItem.url,
              applyMethod: jobData.applyMethod || '',
              sourceUrl: queueItem.url
            }
          });
          storedJobs.push(job as unknown as { id: string } & Record<string, unknown>);
        } catch (error) {
          console.warn(`Failed to store job: ${(error as Error).message}`);
        }
      }

      // Store next URLs
      const domain = extractDomain(queueItem.url);
      for (const nextUrl of extracted.nextUrls || []) {
        try {
          const nextDomain = extractDomain(nextUrl);
          
          // Only crawl same domain or known job sites
          if (nextDomain === domain || 
              ['linkedin.com', 'indeed.com', 'glassdoor.com'].some(d => nextDomain.includes(d))) {
            
            await prisma.crawlQueue.upsert({
              where: { url: nextUrl },
              update: {},
              create: {
                url: nextUrl,
                discoveryMethod: 'crawler',
                domain: nextDomain,
                depth: ((queueItem as unknown as { depth?: number }).depth || 0) + 1
              }
            });
          }
        } catch (error) {
          console.warn(`Failed to store next URL ${nextUrl}:`, (error as Error).message);
        }
      }

      // Mark as processed
      await prisma.crawlQueue.update({
        where: { id: queueItem.id },
        data: { processed: true }
      });

      const remaining = await prisma.crawlQueue.count({
        where: { processed: false }
      });

      console.log(`✅ Processed ${queueItem.url}: ${storedJobs.length} jobs`);
      
      return {
        status: 'processed' as const,
        jobs: storedJobs,
        nextUrls: extracted.nextUrls || [],
        remaining
      };

    } catch (error) {
      lastError = error as Error;
      console.warn(`❌ Attempt ${attempt} failed for ${queueItem.url}:`, (error as Error).message);
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
      }
    }
  }

  // Mark as processed with error
  await prisma.crawlQueue.update({
    where: { id: queueItem.id },
    data: { processed: true }
  });

  const remaining = await prisma.crawlQueue.count({
    where: { processed: false }
  });

  return {
    status: 'error' as const,
    error: lastError?.message || 'Unknown error',
    remaining
  };
}

// Enhanced embedding generation
export async function generateEmbeddingsAndStore(jobId: string, title: string, description: string, requirements: string) {
  try {
    const model = process.env.HUGGINGFACE_EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2';
    const input = `${title}\n${description}\n${requirements}`.slice(0, 8000);
    const embedding = await getHf().featureExtraction({ model, inputs: input });
    
    const vector = Array.isArray(embedding[0]) ? (embedding[0] as number[]) : (embedding as unknown as number[]);
    
    await prisma.job.update({ where: { id: jobId }, data: { embedding: vector as unknown as Prisma.InputJsonValue } });
    
    // Update job with embedding using raw SQL for pgvector
    if (Array.isArray(vector) && vector.length > 0) {
      const floats = (vector as number[]).slice(0, 768); // ensure dim match
      try {
        await prisma.$executeRaw`
          UPDATE "Job" 
          SET embedding_vector = ${JSON.stringify(floats)}::vector 
          WHERE id = ${jobId}
        `;
      } catch (error) {
        // Vector column might not exist yet, ignore for now
        console.warn(`Vector update failed for job ${jobId}:`, (error as Error).message);
      }
    }
    
    return vector;
  } catch (error) {
    console.error(`Failed to generate embedding for job ${jobId}:`, error);
    throw error;
  }
}

export async function remainingQueueCount() {
  return prisma.crawlQueue.count({ where: { processed: false } });
}

export async function generateDiscoveryPrompts(goal: string) {
  const base = goal.trim();
  const prompt = `
You are an expert research assistant generating concise web search queries to discover job listings.

Goal: "${base}"

Return 5-8 diverse, short queries that will find actual job boards or job listings for this goal. Focus on job-specific phrasing and include terms like "jobs", "hiring", "careers", and the role or tech. Include variations such as remote, junior/senior, and geography if relevant.

Return ONLY a JSON array of strings.`;
  try {
    const res = await getHf().textGeneration({
      model: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
      inputs: prompt,
      parameters: { max_new_tokens: 400, temperature: 0.2, return_full_text: false }
    });
    const match = res.generated_text.match(/\[[\s\S]*\]/);
    if (!match) return [base];
    const arr = JSON.parse(match[0]);
    if (Array.isArray(arr) && arr.every(v => typeof v === 'string')) {
      return arr as string[];
    }
    return [base];
  } catch {
    return [base];
  }
}

export async function autoDiscoverAndEnqueue(goal: string) {
  const queries = await generateDiscoveryPrompts(goal);
  const aggregate = { totalUrlsStored: 0, totalFound: 0, queueCount: 0, queries };
  for (const q of queries) {
    const r = await queryTavilyAndStoreUrls(q);
    aggregate.totalUrlsStored += r.urls.length;
    aggregate.totalFound += r.totalFound;
    aggregate.queueCount = r.queueCount; // last known
  }
  return aggregate;
}
