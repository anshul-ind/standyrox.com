import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { adZones } from "@/lib/db/schema";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Increment view_count by 1 — non-blocking, best-effort
  await db
    .update(adZones)
    .set({ viewCount: sql`${adZones.viewCount} + 1` })
    .where(sql`${adZones.id} = ${id}`);

  return NextResponse.json({ ok: true });
}
