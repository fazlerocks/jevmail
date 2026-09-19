import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { missingEnv } from "@/lib/env";
import SetupPanel from "@/components/SetupPanel";
import { Button } from "@/components/ui/button";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const missing = missingEnv();
  const { reason } = await searchParams;
  if (missing.length === 0) {
    const session = await auth();
    if (session?.accessToken && !session.error) redirect("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Jevmail</h1>
          <p className="text-sm text-muted-foreground">Your inbox, sorted by Jev. Read-only. It never marks, moves, labels, or replies.</p>
        </div>
        {missing.length > 0 ? (
          <SetupPanel missing={missing} />
        ) : (
          <form action={async () => { "use server"; await signIn("google", { redirectTo: "/" }); }} className="space-y-3">
            {reason === "expired" && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Your Google session expired. In Testing mode tokens last 7 days, so a weekly sign-in is expected.</p>
            )}
            <Button type="submit" size="lg" className="w-full rounded-full">Sign in with Google</Button>
            <p className="text-center text-xs text-muted-foreground">Google will ask only to <em>view</em> your email.</p>
          </form>
        )}
      </div>
    </main>
  );
}
