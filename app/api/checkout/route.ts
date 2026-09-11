import { NextResponse } from "next/server";

import { checkoutRequestSchema } from "@/lib/validations/checkout";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = checkoutRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          details: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const payload = parsed.data;

    // TODO: Sprint 5 will create order, reserve zone, call Dodo
    console.log("=== CHECKOUT STUB (Sprint 4) ===");
    console.log("Zone ID:", payload.zoneId);
    console.log("Brand:", payload.brandName);
    console.log("Email:", payload.buyerEmail);
    console.log("Logo:", payload.logoUrl);
    console.log("URL:", payload.brandUrl ?? "(none)");
    console.log("================================");

    return NextResponse.json({
      success: true,
      stub: true,
      message:
        "This is a stub. Payment integration will be added in Sprint 5.",
    });
  } catch (err) {
    console.error("Checkout error:", err);
    return NextResponse.json(
      { error: "Failed to process checkout" },
      { status: 500 }
    );
  }
}
