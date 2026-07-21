import { and, eq } from "drizzle-orm";

import { db } from "../db/client.ts";
import { users } from "../db/schema.ts";
import type { User, UserInsert, UserPreferences } from "../db/schema.ts";

export async function findUser(tenantId: string, id: string): Promise<User | null> {
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.id, id)));
  return rows[0] ?? null;
}

export async function listUsers(tenantId: string): Promise<User[]> {
  return db.select().from(users).where(eq(users.tenantId, tenantId));
}

export async function savePreferences(
  id: string,
  preferences: UserPreferences,
): Promise<void> {
  await db.update(users).set({ preferences }).where(eq(users.id, id));
}

export async function createUser(values: UserInsert): Promise<User> {
  const rows = await db.insert(users).values(values).returning();
  const created = rows[0];
  if (!created) {
    throw new Error(`Failed to create user ${values.id}: insert returned no rows`);
  }
  return created;
}
