"use client";

import { useEffect, useState } from "react";

import { formatInt, formatUSDFromCents } from "@/lib/format";

interface Stats {
  totalValueCents: number;
  occupiedZones: number;
  openZones: number;
  totalZones: number;
}

const EMPTY_STATS: Stats = {
  totalValueCents: 0,
  occupiedZones: 0,
  openZones: 0,
  totalZones: 0,
};

/**
 * Stats strip wired to real data from /api/zones.
 * Shows total marketplace value, occupied/open zones.
 */
export default function Hero() {
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      try {
        const res = await fetch("/api/zones");
        if (!res.ok) throw new Error(`zones ${res.status}`);
        const data = (await res.json()) as { zones: Array<{ basePriceCents: number; status: string }> };

        if (cancelled) return;

        const next: Stats = { ...EMPTY_STATS, totalZones: data.zones.length };
        for (const zone of data.zones) {
          next.totalValueCents += zone.basePriceCents;
          if (zone.status === "occupied") {
            next.occupiedZones += 1;
          } else {
            next.openZones += 1;
          }
        }
        setStats(next);
      } catch (err) {
        console.error("Failed to load hero stats:", err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    loadStats();
    return () => {
      cancelled = true;
    };
  }, []);

  const items = [
    { label: "Marketplace value", value: loaded ? formatUSDFromCents(stats.totalValueCents) : "—" },
    { label: "Occupied zones", value: loaded ? formatInt(stats.occupiedZones) : "—" },
    { label: "Open zones", value: loaded ? formatInt(stats.openZones) : "—" },
    { label: "Total zones", value: loaded ? formatInt(stats.totalZones) : "—" },
  ];

  return (
    <section className="flex flex-col items-center gap-8 text-center">
      <div className="flex flex-col gap-3">
        <span className="text-[11px] font-medium tracking-[0.35em] text-amber-200/70 uppercase">
          Stand Out
        </span>
        <h1 className="max-w-2xl font-serif text-4xl font-bold text-amber-50 sm:text-5xl">
          Your brand, worn by the world&apos;s most exclusive avatar.
        </h1>
        <p className="max-w-xl text-sm text-zinc-400 sm:text-base">
          A limited set of ad zones on a collector-grade 3D avatar. Claim one
          before they&apos;re gone.
        </p>
      </div>

      <dl className="grid w-full max-w-2xl grid-cols-2 gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 sm:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="bg-zinc-950/95 px-4 py-5">
            <dt className="text-[10px] tracking-[0.2em] text-zinc-500 uppercase">
              {item.label}
            </dt>
            <dd className="mt-1 font-mono text-xl text-amber-100">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
