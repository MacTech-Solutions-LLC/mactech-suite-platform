"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadOrgLogo } from "@/lib/services/customer-org-service";
import { toast } from "@/components/ui/use-toast";

export function UploadOrgLogoButton({ orgId }: { orgId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const fd = new FormData();
          fd.append("logo", file);
          startTransition(async () => {
            try {
              await uploadOrgLogo(orgId, fd);
              toast({
                title: "Logo updated",
                description: "Pushed to Clerk and mirrored locally.",
                variant: "success",
              });
              router.refresh();
            } catch (err) {
              toast({
                title: "Logo upload failed",
                description: err instanceof Error ? err.message : "Unknown error",
                variant: "destructive",
              });
            } finally {
              if (inputRef.current) inputRef.current.value = "";
            }
          });
        }}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className={pending ? "h-3.5 w-3.5 animate-pulse" : "h-3.5 w-3.5"} />
        {pending ? "Uploading…" : "Upload logo"}
      </Button>
    </>
  );
}
