import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const REASONS: Record<string, { title: string; body: string }> = {
  no_profile: {
    title: "Account not yet provisioned",
    body: "Your sign-in succeeded, but a MacTech profile has not been created for this user. Ask a MacTech Super Admin to provision your account.",
  },
  no_platform_access: {
    title: "Platform access required",
    body: "Your account does not have an internal MacTech platform role. The Identity Command Center is restricted to MacTech employees and partners with platform access.",
  },
  permission_denied: {
    title: "Permission denied",
    body: "Your role does not include the permission required for this action. Contact a MacTech Super Admin if you believe this is in error.",
  },
  default: {
    title: "Access restricted",
    body: "You are signed in, but cannot access the requested resource.",
  },
};

export default function AccessRestrictedPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const reasonKey =
    typeof searchParams?.reason === "string" ? searchParams!.reason : "default";
  const reason = REASONS[reasonKey] ?? REASONS.default;
  return (
    <div className="grid-bg flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-destructive/15 text-destructive">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <CardTitle>{reason.title}</CardTitle>
          <CardDescription>{reason.body}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <SignOutButton redirectUrl="/">
            <Button variant="outline">Sign out</Button>
          </SignOutButton>
          <Button asChild>
            <Link href="/">Try again</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
