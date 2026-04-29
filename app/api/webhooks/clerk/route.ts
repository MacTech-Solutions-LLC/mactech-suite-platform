import { NextResponse, type NextRequest } from "next/server";
import { Webhook } from "svix";
import { env, clerkWebhookConfigured } from "@/lib/env";
import {
  upsertUserFromClerk,
  deleteUserFromClerk,
  upsertOrgFromClerk,
  deleteOrgFromClerk,
  upsertMembershipFromClerk,
  deleteMembershipFromClerk,
  logWebhookEvent,
} from "@/lib/services/clerk-sync-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!clerkWebhookConfigured()) {
    return NextResponse.json(
      { error: "CLERK_WEBHOOK_SECRET is not configured." },
      { status: 503 },
    );
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: "Missing svix signature headers." },
      { status: 400 },
    );
  }

  const body = await request.text();
  let evt: { type: string; data: Record<string, unknown> };
  try {
    const wh = new Webhook(env.CLERK_WEBHOOK_SECRET!);
    evt = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as { type: string; data: Record<string, unknown> };
  } catch (err) {
    await logWebhookEvent("verify_failed", false, {
      message: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "Signature verification failed." }, { status: 400 });
  }

  try {
    switch (evt.type) {
      case "user.created":
      case "user.updated":
        await upsertUserFromClerk(evt.data as never);
        break;
      case "user.deleted":
        if (typeof evt.data.id === "string") {
          await deleteUserFromClerk(evt.data.id);
        }
        break;
      case "organization.created":
      case "organization.updated":
        await upsertOrgFromClerk(evt.data as never);
        break;
      case "organization.deleted":
        if (typeof evt.data.id === "string") {
          await deleteOrgFromClerk(evt.data.id);
        }
        break;
      case "organizationMembership.created":
      case "organizationMembership.updated":
        await upsertMembershipFromClerk(evt.data as never);
        break;
      case "organizationMembership.deleted":
        await deleteMembershipFromClerk(evt.data as never);
        break;
      default:
        // No-op for unhandled events; we still log them for traceability.
        break;
    }

    await logWebhookEvent(evt.type, true, { id: svixId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await logWebhookEvent(evt.type, false, {
      id: svixId,
      message: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "Handler failed." }, { status: 500 });
  }
}
