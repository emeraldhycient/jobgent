"use client";
import { useState } from "react";

// Lightweight in-browser LlamaIndex Canvas via web runtime
// We avoid server adapters and use fetch tools against our APIs.

type Message = { role: "user" | "assistant"; content: string };

type JobLite = { title?: string; company?: string };

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Ask me about scraped jobs. I can also kick off discovery and crawling." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setBusy(true);

    // Very small router: detect intents and call APIs. In a full LlamaIndex Canvas,
    // you'd wire Tools/Indices. Here we simulate a tool-augmented chat.
    try {
      let reply = "";
      if (/discover\b|seed\b/i.test(text)) {
        const mode = /auto\b/i.test(text) ? "auto" : "single";
        const prompt = text.replace(/^(discover|seed)\s*/i, "");
        const res = await fetch("/api/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: prompt || text, mode }),
        }).then((r) => r.json());
        reply = `Discovery (${mode}) complete. Queue ~${res.queueCount ?? "?"}.`;
      } else if (/crawl\b|process\b/i.test(text)) {
        const res = await fetch("/api/crawl", { method: "POST" }).then((r) => r.json());
        if (res.status === 'processed') {
          reply = `Crawled 1 URL. Added ${res.jobs?.length ?? 0} jobs. Remaining ${res.remaining ?? 0}.`;
        } else {
          reply = `Crawl status: ${res.status}. Remaining ${res.remaining ?? 0}.`;
        }
      } else if (/run graph|discover and crawl|end to end/i.test(text)) {
        const prompt = text.replace(/run graph|discover and crawl|end to end/gi, '').trim() || 'Remote software jobs';
        const res = await fetch('/api/discover-and-crawl', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, maxIterations: 50, multiDiscovery: true })
        }).then(r=>r.json());
        reply = `Graph run finished. Trace events: ${Array.isArray(res.trace)?res.trace.length:0}.`;
      } else if (/list jobs|show jobs|jobs\b/i.test(text)) {
        const qMatch = text.match(/\bq:(.+)$/i);
        const q = qMatch ? qMatch[1].trim() : undefined;
        const url = q ? `/api/jobs?q=${encodeURIComponent(q)}&take=25` : '/api/jobs?take=25';
        const res = await fetch(url).then(r=>r.json());
        const jobs: JobLite[] = Array.isArray(res.jobs) ? (res.jobs as JobLite[]) : [];
        const lines = jobs.slice(0, 10).map((j) => `- ${j.title ?? 'Untitled'} @ ${j.company ?? ''}`);
        reply = lines.length ? `Top jobs:\n${lines.join('\n')}` : 'No jobs found yet.';
      } else if (/recommend|match for/i.test(text)) {
        reply = 'To get recommendations, first create a user profile via POST /api/user-profile with a summary.';
      } else {
        reply = 'I can: discover <goal>, discover auto <goal>, crawl, run graph <goal>, list jobs [q:term].';
      }

      setMessages((m) => [...m, { role: "assistant", content: reply }] );
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: `Error: ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Jobs Chat</h1>
      <div className="border rounded p-3 h-[520px] overflow-auto bg-white">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <div className={`inline-block my-1 px-3 py-2 rounded ${m.role==='user'?'bg-blue-600 text-white':'bg-gray-100'}`}>{m.content}</div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="border flex-1 px-3 py-2 rounded"
          placeholder="e.g., discover auto Remote data engineer jobs"
          value={input}
          onChange={(e)=>setInput(e.target.value)}
          onKeyDown={(e)=>{ if(e.key==='Enter' && !busy) send(); }}
        />
        <button className="px-4 py-2 bg-black text-white rounded" onClick={send} disabled={busy}>
          {busy ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
}