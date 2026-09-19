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
      <Inbox
        email={session.user?.email ?? ""}
        signOut={
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button className="text-[13px] text-muted-foreground hover:text-foreground">Sign out</button>
          </form>
        }
      />
    </main>
  );
}
