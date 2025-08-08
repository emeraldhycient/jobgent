import { NextRequest, NextResponse } from 'next/server';

type ChatMessage = { role: 'user'|'assistant'|'system'|'data'; content: string };

function lastUserMessage(messages: ChatMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content;
  }
  return '';
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as { messages?: ChatMessage[]; data?: unknown }));
  const messages = Array.isArray(body.messages) ? (body.messages as ChatMessage[]) : [];
  const text = lastUserMessage(messages).trim();

  try {
    // intent routing
    if (/^discover\b/i.test(text)) {
      const mode = /\bauto\b/i.test(text) ? 'auto' : 'single';
      const prompt = text.replace(/^discover\s*/i, '').trim() || text;
      const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/api/discover`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, mode })
      });
      const data = (await r.json()) as { queueCount?: number };
      return NextResponse.json({ message: { role: 'assistant', content: `Discovery (${mode}) done. Queue ~${data.queueCount ?? '?'}.` } satisfies ChatMessage });
    }

    if (/\bcrawl\b/i.test(text)) {
      const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/api/crawl`, { method: 'POST' });
      const data = (await r.json()) as { status?: string; jobs?: unknown[]; remaining?: number };
      const msg = data.status === 'processed'
        ? `Crawled 1 URL. Added ${data.jobs?.length ?? 0} jobs. Remaining ${data.remaining ?? 0}.`
        : `Crawl status: ${data.status}. Remaining ${data.remaining ?? 0}.`;
      return NextResponse.json({ message: { role: 'assistant', content: msg } satisfies ChatMessage });
    }

    if (/run graph|discover and crawl|end to end/i.test(text)) {
      const prompt = text.replace(/run graph|discover and crawl|end to end/gi, '').trim() || 'Remote software jobs';
      const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/api/discover-and-crawl`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxIterations: 50, multiDiscovery: true })
      });
      const data = (await r.json()) as { trace?: unknown[] };
      const count = Array.isArray(data.trace) ? data.trace.length : 0;
      return NextResponse.json({ message: { role: 'assistant', content: `Graph run finished. Trace events: ${count}.` } satisfies ChatMessage });
    }

    if (/^list jobs\b|\bjobs\b/i.test(text)) {
      const qMatch = text.match(/\bq:(.+)$/i);
      const q = qMatch ? qMatch[1].trim() : undefined;
      const url = q ? `/api/jobs?q=${encodeURIComponent(q)}&take=10` : '/api/jobs?take=10';
      const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ''}${url}`);
      const data = (await r.json()) as { jobs?: Array<{ title?: string; company?: string }> };
      const lines = (data.jobs || []).slice(0, 10).map((j) => `- ${j.title ?? 'Untitled'} @ ${j.company ?? ''}`);
      const content = lines.length ? `Top jobs:\n${lines.join('\n')}` : 'No jobs found yet.';
      return NextResponse.json({ message: { role: 'assistant', content } satisfies ChatMessage });
    }

    return NextResponse.json({ message: { role: 'assistant', content: 'Try: discover <goal>, discover auto <goal>, crawl, run graph <goal>, list jobs [q:term].' } as ChatMessage });
  } catch (e) {
    const err = e as Error;
    return NextResponse.json({ message: { role: 'assistant', content: `Error: ${err.message}` } as ChatMessage });
  }
}