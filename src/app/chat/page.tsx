"use client";

export default function ChatPage() {
  return (
    <div className="w-full h-[calc(100vh-64px)]">
      <iframe
        src="https://ui.llamaindex.ai/"
        title="LlamaIndex Canvas"
        className="w-full h-full border-0"
        allow="clipboard-read; clipboard-write; microphone; camera;"
      />
    </div>
  );
}