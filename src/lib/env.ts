const REQUIRED = [
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "AI_GATEWAY_API_KEY",
] as const;

export function missingEnv(): string[] {
  return REQUIRED.filter((k) => !process.env[k] || process.env[k]!.trim() === "");
}

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? "file:./data/jevmail.db",
  /** Newest inbox messages pulled on first sync, and max new messages per later sync. */
  syncLimit: Number(process.env.SYNC_LIMIT ?? 20),
  maxBodyChars: Number(process.env.MAX_BODY_CHARS ?? 2000),
  jevMinIntervalMs: Number(process.env.JEV_MIN_INTERVAL_MS ?? 0),
  /** How many Jev calls the free tier allows per window (measured: 5). */
  jevBurst: Number(process.env.JEV_BURST ?? 5),
  /** Background drain tick. Measured free-tier window is 5 calls per 299 s; 310 s keeps a margin. Set 0 to disable. */
  jevDrainIntervalMs: Number(process.env.JEV_DRAIN_INTERVAL_MS ?? 310_000),
  hasGatewayKey: () => Boolean(process.env.AI_GATEWAY_API_KEY),
};
