import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { adZones } from "@/lib/db/schema";
import { getZoneById } from "@/lib/services/zone.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const zone = await getZoneById(id);

  if (!zone) {
    return NextResponse.json({ error: "Zone not found" }, { status: 404 });
  }

  return NextResponse.json(zone);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: {
    anchorX?: number;
    anchorY?: number;
    anchorZ?: number;
    normalX?: number;
    normalY?: number;
    normalZ?: number;
    width?: number;
    height?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, number> = {};
  if (typeof body.anchorX === "number") updates.anchorX = body.anchorX;
  if (typeof body.anchorY === "number") updates.anchorY = body.anchorY;
  if (typeof body.anchorZ === "number") updates.anchorZ = body.anchorZ;
  if (typeof body.normalX === "number") updates.normalX = body.normalX;
  if (typeof body.normalY === "number") updates.normalY = body.normalY;
  if (typeof body.normalZ === "number") updates.normalZ = body.normalZ;
  if (typeof body.width === "number") updates.width = body.width;
  if (typeof body.height === "number") updates.height = body.height;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  await db.update(adZones).set(updates).where(eq(adZones.id, id));

  const updated = await getZoneById(id);
  return NextResponse.json(updated);
}

