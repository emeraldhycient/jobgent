import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { queryTavilyAndStoreUrls, processNextInQueue, generateEmbeddingsAndStore } from './tools';

// Proper state annotation for LangGraph
const CrawlState = Annotation.Root({
  prompt: Annotation<string>(),
  phase: Annotation<'discover' | 'crawl' | 'embed' | 'done'>({
    reducer: (_, next) => next ?? 'discover'
  }),
  discovered: Annotation<string[]>({
    reducer: (current, next) => [...(current ?? []), ...(next ?? [])]
  }),
  processedJobs: Annotation<Array<{ id: string; title?: string; description?: string; requirements?: string }>>({
    reducer: (current, next) => [...(current ?? []), ...(next ?? [])]
  }),
  queueRemaining: Annotation<number>({
    reducer: (_, next) => next ?? 0
  }),
  iterations: Annotation<number>({
    reducer: (current, next) => (current ?? 0) + (next ?? 0)
  }),
  maxIterations: Annotation<number>({
    reducer: (_, next) => next ?? 25
  }),
  errors: Annotation<string[]>({
    reducer: (current, next) => [...(current ?? []), ...(next ?? [])]
  })
});

type CrawlStateType = typeof CrawlState.State;

type CrawlEvent = { stage: CrawlStateType['phase']; state: CrawlStateType };

// Create workflow - using the correct StateGraph syntax
const workflow = new StateGraph(CrawlState);

// Discovery node - uses Tavily to find initial URLs
workflow.addNode('discover', async (state: CrawlStateType) => {
  try {
    console.log(`🔍 Starting discovery for: "${state.prompt}"`);
    const result = await queryTavilyAndStoreUrls(state.prompt);
    
    return {
      discovered: result.urls,
      phase: 'crawl' as const,
      queueRemaining: result.queueCount
    };
  } catch (error) {
    console.error('Discovery failed:', error);
    return {
      errors: [`Discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      phase: 'done' as const
    };
  }
});

// Crawl node - processes queue items and extracts jobs
workflow.addNode('crawl', async (state: CrawlStateType) => {
  try {
    console.log(`🕷️ Processing queue (${state.queueRemaining} remaining)`);
    const result = await processNextInQueue();
    
    if (result.status === 'idle') {
      return { phase: 'embed' as const };
    }
    
    if (result.status === 'error') {
      return {
        errors: [`Crawl error: ${result.error || 'Unknown error'}`],
        iterations: 1,
        phase: state.iterations >= state.maxIterations ? 'done' : 'crawl'
      };
    }
    
    return {
      processedJobs: (result.jobs as Array<{ id: string; title?: string; description?: string; requirements?: string }>) || [],
      queueRemaining: result.remaining || 0,
      iterations: 1,
      phase: (result.remaining === 0 || state.iterations >= state.maxIterations) 
        ? 'embed' : 'crawl'
    };
  } catch (error) {
    console.error('Crawl failed:', error);
    return {
      errors: [`Crawl failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      iterations: 1,
      phase: 'done' as const
    };
  }
});

// Embedding node - generates embeddings for processed jobs
workflow.addNode('embed', async (state: CrawlStateType) => {
  try {
    console.log(`🧠 Generating embeddings for ${state.processedJobs.length} jobs`);
    
    for (const job of state.processedJobs) {
      if (job && job.id) {
        await generateEmbeddingsAndStore(job.id, job.title || '', job.description || '', job.requirements || '');
      }
    }
    
    return { phase: 'done' as const };
  } catch (error) {
    console.error('Embedding generation failed:', error);
    return {
      errors: [`Embedding failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      phase: 'done' as const
    };
  }
});

// Define workflow edges using proper LangGraph syntax
// eslint-disable-next-line @typescript-eslint/no-explicit-any
workflow.addEdge(START as any, 'discover' as any);

workflow.addConditionalEdges(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  'discover' as any,
  (state: CrawlStateType) => {
    if (state.errors && state.errors.length > 0) return END;
    if (state.phase === 'crawl') return 'crawl';
    return END;
  }
);

workflow.addConditionalEdges(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  'crawl' as any, 
  (state: CrawlStateType) => {
    if (state.phase === 'embed') return 'embed';
    if (state.phase === 'crawl') return 'crawl';
    return END;
  }
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
workflow.addEdge('embed' as any, END as any);

export const crawlGraph = workflow.compile();

// Enhanced runner with better error handling and progress tracking
export async function runDiscoveryAndCrawl(
  prompt: string,
  maxIterations = 25,
  onProgress?: (update: CrawlStateType) => void,
  options?: { multiDiscovery?: boolean }
) {
  try {
    const initialState: CrawlStateType = {
      prompt,
      phase: 'discover' as const,
      maxIterations,
      discovered: [],
      processedJobs: [],
      queueRemaining: 0,
      iterations: 0,
      errors: []
    } as CrawlStateType;

    // Optional multi-discovery bootstrap
    if (options?.multiDiscovery) {
      const { autoDiscoverAndEnqueue } = await import('./tools');
      await autoDiscoverAndEnqueue(prompt);
    }

    const stream = await crawlGraph.stream(initialState, {
      streamMode: 'values'
    });

    const events: CrawlEvent[] = [];

    for await (const state of stream) {
      onProgress?.(state);
      events.push({ stage: state.phase, state });
      console.log(`Phase: ${state.phase}, Iterations: ${state.iterations}/${state.maxIterations}`);
      if (state.errors?.length > 0) {
        console.warn('Errors encountered:', state.errors);
      }
    }

    return events;
  } catch (error) {
    console.error('Graph execution failed:', error);
    throw new Error(`Crawl pipeline failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
