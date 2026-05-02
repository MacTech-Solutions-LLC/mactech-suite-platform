import { PageHeader } from "@/components/layout/admin-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function GovernancePlaceholderPage({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={
          description ??
          "Placeholder workspace. Routing, auth, and audit wiring follow Identity Command Center conventions."
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
          <CardDescription>
            This GovernanceOS section will host workflows and data tied to your tenant context.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            UI shell, Clerk session, MacTech profile, and central audit are already integrated for this route.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
