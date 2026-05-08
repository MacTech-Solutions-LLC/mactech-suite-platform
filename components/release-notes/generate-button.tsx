"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";

export function GenerateButton({ defaultType = "weekly" }: { defaultType?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState(defaultType);

  const onClick = () => {
    startTransition(async () => {
      const resp = await fetch("/api/command-center/release-notes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summaryType: type }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || !body.ok) {
        toast({
          title: "Generation failed",
          description: body.error ?? `HTTP ${resp.status}`,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: body.aiAugmented ? "Summary generated (AI)" : "Summary generated",
        description: `${body.commitsConsidered} commits considered`,
      });
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={type}
        onChange={(e) => setType(e.target.value)}
        disabled={pending}
        className="h-8 rounded-md border border-border bg-background px-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="release">Release</option>
        <option value="manual">Manual</option>
      </select>
      <Button size="sm" variant="outline" onClick={onClick} disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Generating…
          </>
        ) : (
          <>
            <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Generate now
          </>
        )}
      </Button>
    </div>
  );
}
