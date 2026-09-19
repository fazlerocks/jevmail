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
  syncLookbackDays: Number(process.env.SYNC_LOOKBACK_DAYS ?? 7),
  maxBodyChars: Number(process.env.MAX_BODY_CHARS ?? 2000),
  syncMaxPerRun: Number(process.env.SYNC_MAX_PER_RUN ?? 250),
  jevMinIntervalMs: Number(process.env.JEV_MIN_INTERVAL_MS ?? 0),
  hasGatewayKey: () => Boolean(process.env.AI_GATEWAY_API_KEY),
};
