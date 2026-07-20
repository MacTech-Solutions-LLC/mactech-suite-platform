"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bot, Copy, Database, FilePlus2, RotateCcw, Send, ShieldAlert, Square, ThumbsDown, ThumbsUp, Wrench } from "lucide-react";

type Citation = { documentId: string; title: string; sourceApplication: string; sourceObjectId: string; sourceUrl: string; revision: string; excerpt: string };
type ToolResult = { toolName: string; status: string; riskLevel: string; label?: string; approvalId?: string; recordId?: string; recordUrl?: string; data?: unknown };
type Message = { id: string; role: "user" | "assistant"; content: string; requestId?: string; citations?: Citation[]; toolResult?: ToolResult; error?: string };

export function AiWorkspace({ organizations, canAdmin, initialConversationId }: { organizations: Array<{ id: string; name: string }>; canAdmin: boolean; initialConversationId: string }) {
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? "");
  const [classification, setClassification] = useState("PUBLIC");
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const [useRetrieval, setUseRetrieval] = useState(true);
  const [toolName, setToolName] = useState("");
  const [toolArgs, setToolArgs] = useState("{}");
  const [running, setRunning] = useState(false);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const abortRef = useRef<AbortController | null>(null);
  const selectedOrganization = useMemo(() => organizations.find((org) => org.id === organizationId), [organizations, organizationId]);

  async function submit(overridePrompt?: string) {
    const text = (overridePrompt ?? prompt).trim();
    if (!text || !organizationId || running) return;
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(toolArgs) as Record<string, unknown>; } catch { setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: "", error: "Tool arguments must be valid JSON." }]); return; }
    const user: Message = { id: crypto.randomUUID(), role: "user", content: text };
    const assistantId = crypto.randomUUID();
    setMessages((current) => [...current, user, { id: assistantId, role: "assistant", content: "", citations: [] }]);
    setPrompt("");
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          conversationId,
          organizationId,
          classification,
          messages: [...messages, user].slice(-20).map(({ role, content }) => ({ role, content })),
          useRetrieval,
          retrievalQuery: text,
          ...(toolName ? { toolName, toolArguments: args } : {}),
        }),
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({ message: "Request failed." })) as { message?: string };
        throw new Error(body.message ?? `Request failed (${response.status}).`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as Record<string, unknown>;
          setMessages((current) => current.map((message) => {
            if (message.id !== assistantId) return message;
            if (event.type === "delta") return { ...message, content: message.content + String(event.content ?? "") };
            if (event.type === "citation") return { ...message, citations: [...(message.citations ?? []), event.citation as Citation] };
            if (event.type === "tool_result") return { ...message, toolResult: event.result as ToolResult };
            if (event.type === "meta") {
              if (typeof event.conversationId === "string") setConversationId(event.conversationId);
              return { ...message, requestId: String(event.requestId ?? "") };
            }
            if (event.type === "error") return { ...message, error: String(event.message ?? "AI request failed safely.") };
            return message;
          }));
        }
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, error: error instanceof Error ? error.message : "AI request failed." } : message));
      }
    } finally { setRunning(false); abortRef.current = null; }
  }

  function startNew() { abortRef.current?.abort(); setMessages([]); setConversationId(crypto.randomUUID()); setPrompt(""); }

  const starters = [
    ["Assess an opportunity", "Assess the synthetic opportunity requirements and identify what is fact versus recommendation."],
    ["Find compliance evidence", "Find approved sources explaining the human-review requirement for AI drafts."],
    ["Create a proposal outline", "Create a concise DRAFT proposal outline based only on authorized synthetic context."],
    ["List pursuits due soon", "Use the configured Suite tools to help identify pursuits due soon."],
  ];

  return (
    <div className="grid min-h-[72vh] gap-4 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
      <aside className="rounded-lg border border-border bg-card p-4">
        <button onClick={startNew} className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">New conversation</button>
        <div className="mt-5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Session</div>
        <div className="mt-2 rounded-md border border-border bg-background p-3 text-xs">
          <div className="font-medium">Current conversation</div>
          <div className="mt-1 truncate font-mono text-muted-foreground">{conversationId}</div>
        </div>
        <div className="mt-5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Starter actions</div>
        <div className="mt-2 space-y-2">
          {starters.map(([label, value]) => <button key={label} onClick={() => { setPrompt(value); if (label.includes("evidence")) setUseRetrieval(true); }} className="w-full rounded-md border border-border px-3 py-2 text-left text-xs hover:bg-secondary">{label}</button>)}
        </div>
      </aside>

      <section className="flex min-h-[72vh] min-w-0 flex-col rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 text-xs">
          <span className="rounded-full bg-primary/15 px-2 py-1 text-primary">{classification}</span>
          <span className="rounded-full bg-secondary px-2 py-1">Tenant: {selectedOrganization?.name ?? "unresolved"}</span>
          <span className="rounded-full bg-secondary px-2 py-1">Model: environment default</span>
          <span className="ml-auto font-mono text-muted-foreground">{messages.at(-1)?.requestId ?? "no request"}</span>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="mx-auto mt-20 max-w-xl text-center"><Bot className="mx-auto h-10 w-10 text-primary" /><h2 className="mt-4 text-xl font-semibold">MacTech Suite Assistant</h2><p className="mt-2 text-sm text-muted-foreground">Ask about approved synthetic Suite content, run an entitled read tool, create an unapproved ProposalOS draft, or preview a consequential action for human approval.</p></div>
          ) : messages.map((message) => (
            <article key={message.id} className={message.role === "user" ? "ml-auto max-w-2xl rounded-lg bg-primary/15 p-4" : "mr-auto max-w-3xl rounded-lg border border-border bg-background p-4"}>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{message.role}</div>
              {message.error ? <div className="text-sm text-destructive">{message.error}</div> : <div className="whitespace-pre-wrap text-sm leading-6">{message.content || (running ? "Thinking…" : "")}</div>}
              {message.toolResult ? <ToolCard result={message.toolResult} /> : null}
              {message.citations?.length ? <div className="mt-4 grid gap-2">{message.citations.map((citation) => <CitationCard key={citation.documentId} citation={citation} />)}</div> : null}
              {message.role === "assistant" && message.content ? <div className="mt-3 flex gap-2 text-muted-foreground"><button aria-label="Copy response" onClick={() => navigator.clipboard.writeText(message.content)}><Copy className="h-4 w-4" /></button><button aria-label="Helpful"><ThumbsUp className="h-4 w-4" /></button><button aria-label="Not helpful"><ThumbsDown className="h-4 w-4" /></button></div> : null}
            </article>
          ))}
        </div>
        <div className="border-t border-border p-4">
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} placeholder="Ask MacTech AI using PUBLIC or approved INTERNAL synthetic content…" className="min-h-24 w-full resize-none rounded-md border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary" />
          <div className="mt-2 flex items-center gap-2">
            <button onClick={() => running ? abortRef.current?.abort() : void submit()} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">{running ? <><Square className="h-4 w-4" /> Stop</> : <><Send className="h-4 w-4" /> Send</>}</button>
            <button onClick={() => { const last = [...messages].reverse().find((message) => message.role === "user"); if (last) void submit(last.content); }} disabled={running} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"><RotateCcw className="h-4 w-4" /> Retry</button>
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm"><div className="flex items-center gap-2 font-semibold text-amber-300"><ShieldAlert className="h-4 w-4" /> Development inference</div><p className="mt-2 text-xs leading-5 text-muted-foreground">Do not enter FCI, CUI, export-controlled data, credentials, customer-sensitive proposal data, or personal information. Server policy blocks controlled classifications before inference.</p></div>
        <div className="rounded-lg border border-border bg-card p-4">
          <label className="text-xs font-medium">Active organization</label>
          <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} className="mt-2 w-full rounded-md border border-border bg-background p-2 text-sm">{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select>
          <label className="mt-4 block text-xs font-medium">Classification</label>
          <select value={classification} onChange={(event) => setClassification(event.target.value)} className="mt-2 w-full rounded-md border border-border bg-background p-2 text-sm"><option>PUBLIC</option><option>INTERNAL</option><option>FCI</option><option>CUI</option><option>UNKNOWN</option></select>
          <label className="mt-4 flex items-center gap-2 text-xs"><input type="checkbox" checked={useRetrieval} onChange={(event) => setUseRetrieval(event.target.checked)} /><Database className="h-4 w-4" /> Use approved retrieval</label>
        </div>
        <div className="rounded-lg border border-border bg-card p-4"><div className="flex items-center gap-2 text-sm font-semibold"><Wrench className="h-4 w-4" /> Controlled tool</div><select value={toolName} onChange={(event) => setToolName(event.target.value)} className="mt-3 w-full rounded-md border border-border bg-background p-2 text-xs"><option value="">No tool</option><option value="suite.search_opportunities">Search opportunities</option><option value="suite.read_opportunity">Read opportunity</option><option value="suite.create_proposal_pursuit_draft">Create ProposalOS DRAFT</option><option value="suite.submit_proposal">Request proposal submission</option></select><textarea value={toolArgs} onChange={(event) => setToolArgs(event.target.value)} className="mt-2 min-h-28 w-full rounded-md border border-border bg-background p-2 font-mono text-xs" /><p className="mt-2 text-[11px] text-muted-foreground">Unknown fields are rejected. Consequential actions create approval requests and do not execute.</p></div>
        {canAdmin ? <Link href="/admin/ai/admin" className="block rounded-lg border border-border bg-card p-4 text-sm hover:bg-secondary"><span className="font-semibold">AI administration</span><span className="mt-1 block text-xs text-muted-foreground">Provider health and sanitized configuration</span></Link> : null}
      </aside>
    </div>
  );
}

function CitationCard({ citation }: { citation: Citation }) { return <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs"><div className="font-semibold">{citation.title} · rev {citation.revision}</div><div className="mt-1 text-muted-foreground">{citation.sourceApplication} / {citation.sourceObjectId}</div><p className="mt-2 leading-5">{citation.excerpt}</p></div>; }

function ToolCard({ result }: { result: ToolResult }) { return <div className="mt-4 rounded-md border border-border bg-card p-3 text-xs"><div className="flex items-center gap-2 font-semibold"><FilePlus2 className="h-4 w-4" /> {result.label ?? result.toolName}</div><div className="mt-1 text-muted-foreground">{result.status} · {result.riskLevel}</div>{result.approvalId ? <Link className="mt-2 block text-primary underline" href={`/admin/agents/${result.approvalId}`}>Open human approval request</Link> : null}{result.recordUrl ? <a className="mt-2 block text-primary underline" href={result.recordUrl}>Open confirmed domain draft</a> : null}</div>; }
