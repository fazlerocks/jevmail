export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startDrainer } = await import("@/lib/drainer");
    startDrainer();
  }
}
