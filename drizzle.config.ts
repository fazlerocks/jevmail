import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: (process.env.DATABASE_URL ?? "file:./data/jevmail.db").replace(/^file:/, ""),
  },
});
