"use client";
import { useMemo, useState } from "react";
import {
  ChatSection,
  ChatMessages,
  ChatInput,
  ChatCanvas,
} from "@llamaindex/chat-ui";
import "@llamaindex/chat-ui/styles/markdown.css";
import "@llamaindex/chat-ui/styles/editor.css";
import "@llamaindex/chat-ui/styles/pdf.css";

// Minimal provider implementation inline using Chat UI's expected context shape
// We keep it local to this page to avoid extra wrappers.

type MessageRole = 'system' | 'user' | 'assistant' | 'data';

type JSONValue = null | string | number | boolean | { [k: string]: JSONValue } | JSONValue[];

type Message = {
  role: MessageRole;
  content: string;
  annotations?: JSONValue[];
};

type RequestData = Record<string, unknown>;

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [requestData, setRequestData] = useState<RequestData>({});

  const handler = useMemo(() => ({
    input,
    setInput,
    isLoading,
    messages,
    requestData,
    setRequestData: (data: RequestData) => setRequestData(data),
    append: async (message: Message, options?: { data?: RequestData }) => {
      setMessages((m) => [...m, message]);
      setIsLoading(true);
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [...messages, message], data: options?.data ?? requestData })
        });
        const data = (await res.json()) as { message?: Message };
        const assistant: Message = data?.message ?? { role: 'assistant', content: 'No response' };
        setMessages((m) => [...m, assistant]);
      } catch (e) {
        const err = e as Error;
        setMessages((m) => [...m, { role: 'assistant', content: `Error: ${err.message}` }]);
      } finally {
        setIsLoading(false);
      }
      return null;
    },
  }), [input, isLoading, messages, requestData]);

  return (
    <div className="max-w-4xl mx-auto p-4">
      {/* Chat UI Layout */}
      <ChatSection handler={handler} autoOpenCanvas>
        <ChatMessages>
          <ChatMessages.List />
          <ChatMessages.Empty heading="Jobs Chat" subheading="Ask to discover, crawl, or list jobs." />
          <ChatMessages.Loading>Thinking…</ChatMessages.Loading>
          <ChatMessages.Actions />
        </ChatMessages>

        <ChatCanvas>
          <ChatCanvas.CodeArtifact />
          <ChatCanvas.DocumentArtifact />
          <ChatCanvas.Actions>
            <ChatCanvas.Actions.History />
            <ChatCanvas.Actions.Copy />
            <ChatCanvas.Actions.Download />
            <ChatCanvas.Actions.Close />
          </ChatCanvas.Actions>
        </ChatCanvas>

        <ChatInput>
          <ChatInput.Form>
            <ChatInput.Field placeholder="e.g., discover auto Remote data engineer jobs" />
            <ChatInput.Submit disabled={isLoading}>Send</ChatInput.Submit>
          </ChatInput.Form>
        </ChatInput>
      </ChatSection>
    </div>
  );
}