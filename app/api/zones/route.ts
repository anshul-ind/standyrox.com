import { NextResponse } from "next/server";

import { getZones } from "@/lib/services/zone.service";

export async function GET() {
  const data = await getZones();

  if (!data) {
    return NextResponse.json(
      { error: "No active avatar model found" },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}
