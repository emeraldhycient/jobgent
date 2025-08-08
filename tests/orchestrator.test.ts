import { runDiscoveryAndCrawl } from '@/lib/langgraph/graph';

// NOTE: This is a high-level smoke test; in a real test environment we'd mock network & DB.

describe('orchestrator', () => {
  it('returns events array', async () => {
    // Use a benign prompt; external calls may fail without API keys.
    const events = await runDiscoveryAndCrawl('remote test engineer jobs', 0); // zero iterations => only discovery
    expect(Array.isArray(events)).toBe(true);
    if (events.length > 0) {
      expect(events[0]).toHaveProperty('stage');
    }
  });
});
