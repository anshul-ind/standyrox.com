"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-runs the server render of /checkout/success while the payment is still
 * unconfirmed, so the page can flip from "processing" to "confirmed" (and the
 * spot can be claimed) without the buyer reloading by hand.
 *
 * Each refresh re-runs the server-side Dodo verification on the page, so this
 * also covers a webhook that is delayed or cannot be delivered (local dev).
 */
export default function PaymentStatusPoller({
  active,
  intervalMs = 3000,
  maxAttempts = 20,
}: {
  /** Poll only while the order is not confirmed yet. */
  active: boolean;
  intervalMs?: number;
  maxAttempts?: number;
}) {
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);

  // Reset the budget whenever the page stops being active (e.g. confirmed).
  useEffect(() => {
    if (!active) setAttempts(0);
  }, [active]);

  useEffect(() => {
    if (!active || attempts >= maxAttempts) return;
    const timer = setTimeout(() => {
      setAttempts((n) => n + 1);
      router.refresh();
    }, intervalMs);
    return () => clearTimeout(timer);
  }, [active, attempts, intervalMs, maxAttempts, router]);

  return null;
}
