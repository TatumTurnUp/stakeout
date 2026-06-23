// api/_db.js — Neon serverless Postgres client (HTTP driver, ideal for Vercel).
// Files starting with "_" are NOT exposed as API routes.
import { neon } from "@neondatabase/serverless";

export const sql = neon(process.env.DATABASE_URL);

export async function getBalance(token) {
  if (!token) return 0;
  const rows = await sql`SELECT credits FROM accounts WHERE token = ${token}`;
  return rows.length ? rows[0].credits : 0;
}
