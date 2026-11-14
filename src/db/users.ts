import crypto from 'crypto';
import { and, asc, eq, ne } from 'drizzle-orm';
import { db } from './index.ts';
import { users } from './schema.ts';

export interface SafeUserRow {
  id: number;
  uid: string;
  email: string;
  name: string;
  role: string;
  createdAt: Date;
}

export async function hasConfiguredAdmin(): Promise<boolean> {
  try {
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, 'admin'), ne(users.passwordHash, '')))
      .limit(1);
    return admins.length > 0;
  } catch (error) {
    console.error('Database admin check failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function findUserByEmail(email: string) {
  try {
    const normalized = email.trim().toLowerCase();
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, normalized))
      .limit(1);
    return rows[0] || null;
  } catch (error) {
    console.error('Database user lookup failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function findUserById(id: number): Promise<SafeUserRow | null> {
  try {
    const rows = await db
      .select({
        id: users.id,
        uid: users.uid,
        email: users.email,
        name: users.name,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return rows[0] || null;
  } catch (error) {
    console.error('Database user lookup by id failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function listUsers(): Promise<SafeUserRow[]> {
  try {
    return await db
      .select({
        id: users.id,
        uid: users.uid,
        email: users.email,
        name: users.name,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(asc(users.createdAt));
  } catch (error) {
    console.error('Database list users failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function countLocalAdmins(): Promise<number> {
  try {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, 'admin'), ne(users.passwordHash, '')));
    return rows.length;
  } catch (error) {
    console.error('Database count admins failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function createLocalUser(input: {
  email: string;
  name: string;
  passwordHash: string;
  role: 'admin' | 'user';
}): Promise<SafeUserRow> {
  try {
    const normalizedEmail = input.email.trim().toLowerCase();
    const uid = `local-${crypto.randomUUID()}`;

    const [created] = await db
      .insert(users)
      .values({
        uid,
        email: normalizedEmail,
        name: input.name.trim(),
        passwordHash: input.passwordHash,
        role: input.role,
      })
      .returning({
        id: users.id,
        uid: users.uid,
        email: users.email,
        name: users.name,
        role: users.role,
        createdAt: users.createdAt,
      });

    return created;
  } catch (error) {
    console.error('Database create user failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function updateLocalUser(
  id: number,
  updates: {
    name?: string;
    role?: 'admin' | 'user';
    passwordHash?: string;
  }
): Promise<SafeUserRow | null> {
  try {
    const setValues: Partial<typeof users.$inferInsert> = {};
    if (updates.name !== undefined) setValues.name = updates.name.trim();
    if (updates.role !== undefined) setValues.role = updates.role;
    if (updates.passwordHash !== undefined) setValues.passwordHash = updates.passwordHash;

    const [updated] = await db
      .update(users)
      .set(setValues)
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        uid: users.uid,
        email: users.email,
        name: users.name,
        role: users.role,
        createdAt: users.createdAt,
      });

    return updated || null;
  } catch (error) {
    console.error('Database update user failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function deleteLocalUser(id: number): Promise<SafeUserRow | null> {
  try {
    const [deleted] = await db
      .delete(users)
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        uid: users.uid,
        email: users.email,
        name: users.name,
        role: users.role,
        createdAt: users.createdAt,
      });
    return deleted || null;
  } catch (error) {
    console.error('Database delete user failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}
