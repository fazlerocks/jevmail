import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { missingEnv } from "@/lib/env";
import SetupPanel from "@/components/SetupPanel";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const missing = missingEnv();
  const { reason } = await searchParams;
  if (missing.length === 0) {
    const session = await auth();
    if (session?.accessToken && !session.error) redirect("/");
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Jevmail</h1>
          <p className="text-sm text-zinc-500">
            Sorts your inbox with Jev. Read-only. It never marks, moves, labels, or replies.
          </p>
        </div>

        {missing.length > 0 ? (
          <SetupPanel missing={missing} />
        ) : (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
            className="space-y-3"
          >
            {reason === "expired" && (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                Your Google session expired. In Testing mode Google tokens last 7 days, so a weekly sign-in is expected.
              </p>
            )}
            <button
              type="submit"
              className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Sign in with Google
            </button>
            <p className="text-center text-xs text-zinc-500">
              Google will ask only to <em>view</em> your email. Nothing else.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
