import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

export const CATEGORIES = ["needs_reply", "updates", "promotional", "sales", "spam"] as const;
export type Category = (typeof CATEGORIES)[number];

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id").notNull(),
    fromName: text("from_name").notNull().default(""),
    fromEmail: text("from_email").notNull().default(""),
    fromDomain: text("from_domain").notNull().default(""),
    subject: text("subject").notNull().default(""),
    snippet: text("snippet").notNull().default(""),
    receivedAt: integer("received_at").notNull(),
    hasUnsubscribe: integer("has_unsubscribe", { mode: "boolean" }).notNull().default(false),
    isReplyToMe: integer("is_reply_to_me", { mode: "boolean" }).notNull().default(false),
    syncedAt: integer("synced_at").notNull(),
  },
  (t) => [index("messages_received_idx").on(t.receivedAt), index("messages_domain_idx").on(t.fromDomain)],
);

export const classifications = sqliteTable("classifications", {
  messageId: text("message_id")
    .primaryKey()
    .references(() => messages.id, { onDelete: "cascade" }),
  category: text("category", { enum: CATEGORIES }).notNull(),
  categoryProbs: text("category_probs", { mode: "json" }).$type<Record<string, number>>().notNull(),
  urgency: integer("urgency").notNull(),
  isPersonal: real("is_personal").notNull(),
  lowConfidence: integer("low_confidence", { mode: "boolean" }).notNull().default(false),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens"),
  classifiedAt: integer("classified_at").notNull(),
});

export const FEEDBACK_KINDS = ["corrected_category", "handled", "unhandled"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const feedback = sqliteTable(
  "feedback",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: FEEDBACK_KINDS }).notNull(),
    value: text("value"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("feedback_message_idx").on(t.messageId)],
);

export const syncState = sqliteTable("sync_state", {
  id: integer("id").primaryKey(),
  lastHistoryId: text("last_history_id"),
  lastSyncedAt: integer("last_synced_at"),
});
