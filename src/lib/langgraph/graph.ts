import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { z } from 'zod';
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
  processedJobs: Annotation<any[]>({
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
      processedJobs: result.jobs || [],
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
        const text = `${job.title || ''} ${job.description || ''} ${job.requirements || ''}`;
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
workflow.addEdge(START, 'discover');

workflow.addConditionalEdges(
  'discover',
  (state: CrawlStateType) => {
    if (state.errors && state.errors.length > 0) return END;
    if (state.phase === 'crawl') return 'crawl';
    return END;
  }
);

workflow.addConditionalEdges(
  'crawl', 
  (state: CrawlStateType) => {
    if (state.phase === 'embed') return 'embed';
    if (state.phase === 'crawl') return 'crawl';
    return END;
  }
);

workflow.addEdge('embed', END);

export const crawlGraph = workflow.compile();

// Enhanced runner with better error handling and progress tracking
export async function runDiscoveryAndCrawl(
  prompt: string, 
  maxIterations = 25,
  onProgress?: (update: any) => void
) {
  try {
    const initialState = {
      prompt,
      phase: 'discover' as const,
      maxIterations,
      discovered: [],
      processedJobs: [],
      queueRemaining: 0,
      iterations: 0,
      errors: []
    };
    
    const stream = await crawlGraph.stream(initialState, {
      streamMode: 'values'
    });
    
    let finalState = initialState;
    
    for await (const state of stream) {
      finalState = state;
      onProgress?.(state);
      
      // Log progress
      console.log(`Phase: ${state.phase}, Iterations: ${state.iterations}/${state.maxIterations}`);
      
      if (state.errors?.length > 0) {
        console.warn('Errors encountered:', state.errors);
      }
    }
    
    return {
      success: finalState.phase === 'done' && finalState.errors.length === 0,
      discovered: finalState.discovered,
      processedJobs: finalState.processedJobs,
      iterations: finalState.iterations,
      errors: finalState.errors
    };
  } catch (error) {
    console.error('Graph execution failed:', error);
    throw new Error(`Crawl pipeline failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
