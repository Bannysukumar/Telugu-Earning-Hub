import { pgTable, serial, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { plansTable } from "./plans";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const investmentsTable = pgTable("investments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  planId: integer("plan_id").notNull().references(() => plansTable.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  dailyRoi: numeric("daily_roi", { precision: 12, scale: 2 }).notNull(),
  maxReturn: numeric("max_return", { precision: 12, scale: 2 }).notNull(),
  totalEarned: numeric("total_earned", { precision: 12, scale: 2 }).notNull().default("0"),
  daysCompleted: integer("days_completed").notNull().default(0),
  maxDays: integer("max_days").notNull().default(400),
  isActive: boolean("is_active").notNull().default(true),
  startDate: timestamp("start_date").notNull().defaultNow(),
  lastRoiUpdate: timestamp("last_roi_update"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInvestmentSchema = createInsertSchema(investmentsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertInvestment = z.infer<typeof insertInvestmentSchema>;
export type Investment = typeof investmentsTable.$inferSelect;
