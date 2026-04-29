import { SignIn } from "@clerk/nextjs";
import { Hexagon } from "lucide-react";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <div className="grid-bg flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Hexagon className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            MacTech Solutions
          </div>
          <div className="text-base font-semibold">Identity Command Center</div>
        </div>
      </div>
      <SignIn />
    </div>
  );
}
