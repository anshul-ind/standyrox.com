import { NextResponse } from "next/server";

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
