'use client';
import { useState } from 'react';

export default function Home() {
  const [prompt, setPrompt] = useState('Remote React developer jobs');
  const [log, setLog] = useState<string>('');

  async function call(path: string, init?: RequestInit) {
    const res = await fetch(path, { method: 'POST', ...(init || {}), headers: { 'Content-Type': 'application/json' } });
    const data = await res.json();
    return data;
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">JobGent Control Panel</h1>

      <div className="space-y-2">
        <label className="text-sm">Discovery goal</label>
        <input value={prompt} onChange={e=>setPrompt(e.target.value)} className="border px-3 py-2 w-full rounded" />
        <div className="flex flex-wrap gap-2">
          <button className="px-3 py-2 bg-black text-white rounded" onClick={async()=>{
            const r = await call('/api/discover', { body: JSON.stringify({ prompt }) });
            setLog(prev => prev + `\nDiscover(single): ${JSON.stringify(r)}`);
          }}>Discover (single)</button>
          <button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={async()=>{
            const r = await call('/api/discover', { body: JSON.stringify({ prompt, mode: 'auto' }) });
            setLog(prev => prev + `\nDiscover(auto): ${JSON.stringify(r)}`);
          }}>Discover (auto)</button>
          <button className="px-3 py-2 bg-emerald-600 text-white rounded" onClick={async()=>{
            const r = await call('/api/crawl');
            setLog(prev => prev + `\nCrawl one: ${JSON.stringify(r)}`);
          }}>Crawl one</button>
          <button className="px-3 py-2 bg-purple-600 text-white rounded" onClick={async()=>{
            const r = await call('/api/discover-and-crawl', { body: JSON.stringify({ prompt, maxIterations: 50, multiDiscovery: true }) });
            setLog(prev => prev + `\nRun graph: ${JSON.stringify(r).slice(0, 500)}...`);
          }}>Run Graph</button>
        </div>
      </div>

      <pre className="text-xs bg-gray-50 p-3 rounded border max-h-[400px] overflow-auto whitespace-pre-wrap">{log}</pre>
    </div>
  );
}
