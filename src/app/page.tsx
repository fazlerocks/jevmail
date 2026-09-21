import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { missingEnv } from "@/lib/env";
import Stage from "@/components/Stage";

export default async function Home() {
  const missing = missingEnv();
  if (missing.length > 0) redirect("/login");
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  if (session.error) redirect("/login?reason=expired");


  return (
    <main className="h-screen">
      <Stage
        email={session.user?.email ?? ""}
        avatar={session.user?.image ?? null}
        signOut={
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button className="text-[12px] tracking-[0.04em] text-ash hover:text-ink">Sign out</button>
          </form>
        }
      />
    </main>
  );
}
