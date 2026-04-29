"use client";

import { Building2, Link as LinkIcon, AlertCircle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ClerkResyncButton } from "@/components/forms/clerk-resync-button";

export function ClerkLinkageCard({
  orgId,
  clerkOrgId,
  imageUrl,
  name,
}: {
  orgId: string;
  clerkOrgId: string | null;
  imageUrl: string | null;
  name: string;
}) {
  if (!clerkOrgId) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-warning/15 text-[hsl(38_92%_60%)]">
              <AlertCircle className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-medium">Not linked to Clerk</div>
              <div className="text-xs text-muted-foreground">
                Local-only org. Sibling apps cannot resolve this customer until
                a Clerk org is created and linked.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3 min-w-0">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={`${name} logo`}
              className="h-9 w-9 rounded-md object-cover border border-border"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-success/15 text-[hsl(142_71%_55%)]">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-sm font-medium flex items-center gap-2">
              Linked to Clerk
              <Badge variant="success">live</Badge>
            </div>
            <div className="text-xs text-muted-foreground font-mono truncate flex items-center gap-1">
              <LinkIcon className="h-3 w-3" />
              {clerkOrgId}
            </div>
          </div>
        </div>
        <ClerkResyncButton orgId={orgId} />
      </CardContent>
    </Card>
  );
}
