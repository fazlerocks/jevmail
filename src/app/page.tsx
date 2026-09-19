import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { missingEnv } from "@/lib/env";
import Inbox from "@/components/Inbox";

export default async function Home() {
  const missing = missingEnv();
  if (missing.length > 0) redirect("/login");
  const session = await auth();
  if (!session?.accessToken) redirect("/login");
  if (session.error) redirect("/login?reason=expired");

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-baseline gap-3">
            <span className="text-lg font-semibold tracking-tight">Jevmail</span>
            <span className="hidden text-xs text-zinc-500 sm:inline">{session.user?.email}</span>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">Sign out</button>
          </form>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-4">
        <Inbox />
      </div>
    </main>
  );
}
