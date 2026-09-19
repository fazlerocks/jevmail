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
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          <span className="text-[17px] font-semibold tracking-tight" title={session.user?.email ?? ""}>Jevmail</span>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button className="text-[13px] text-muted-foreground hover:text-foreground">Sign out</button>
          </form>
        </div>
      </header>
      <Inbox />
    </main>
  );
}
