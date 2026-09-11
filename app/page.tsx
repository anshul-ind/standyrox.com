"use client";

import { useEffect, useState, useCallback } from "react";

import AvatarScene from "@/components/avatar/AvatarScene";
import type { ZoneData } from "@/components/avatar/AvatarScene";
import ZoneInfoPanel from "@/components/avatar/ZoneInfoPanel";
import type { ZoneDetail } from "@/components/avatar/ZoneInfoPanel";

export default function Home() {
  const [zones, setZones] = useState<ZoneData[]>([]);
  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [selectedZone, setSelectedZone] = useState<ZoneDetail | null>(null);

  // Fetch zones on mount
  useEffect(() => {
    let cancelled = false;

    fetch("/api/zones")
      .then(async (res) => {
        if (res.status === 404) throw new Error("No active avatar model found");
        if (!res.ok) throw new Error(`Failed to load zones (${res.status})`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setZones(data.zones);
        setGlbUrl(data.glbUrl);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load zones");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Keyboard shortcut: Ctrl+D toggles debug labels
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === "d") {
        e.preventDefault();
        setShowDebug((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSelectZone = useCallback(
    (zoneId: string) => {
      const zone = zones.find((z) => z.id === zoneId) ?? null;
      setSelectedZone(zone);

      // Fire-and-forget view count increment
      if (zoneId) {
        fetch(`/api/zones/${zoneId}/view`, { method: "POST" }).catch(() => {
          // Silently ignore — view counting is non-critical
        });
      }
    },
    [zones]
  );

  const handleClosePanel = useCallback(() => {
    setSelectedZone(null);
  }, []);

  return (
    <main className="flex min-h-screen flex-col bg-zinc-950 text-amber-50">
      {/* ── Header ── */}
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-medium tracking-[0.35em] text-amber-200/70 uppercase">
            Stand Out
          </span>
          <span className="text-zinc-600">|</span>
          <span className="font-serif text-sm text-amber-200/50">
            Avatar Ad-Zone Marketplace
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowDebug((prev) => !prev)}
          className={`rounded-full border px-3 py-1 font-mono text-[11px] transition-colors ${
            showDebug
              ? "border-amber-400/60 bg-amber-400/10 text-amber-300"
              : "border-white/10 bg-zinc-900 text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Debug: {showDebug ? "ON" : "OFF"}{" "}
          <span className="text-zinc-600">(Ctrl+D)</span>
        </button>
      </header>

      {/* ── 3D Scene ── */}
      <div className="relative flex-1" style={{ minHeight: "80vh" }}>
        {/* Background glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(180,140,30,0.05) 0%, transparent 70%)",
          }}
        />

        <div className="absolute inset-0 z-10">
          {loading ? (
            <div className="flex h-full w-full items-center justify-center font-mono text-sm text-zinc-500">
              Loading 3D scene…
            </div>
          ) : error ? (
            <div className="flex h-full w-full items-center justify-center font-mono text-sm text-red-400">
              {error}
            </div>
          ) : (
            <AvatarScene
              zones={zones}
              onSelectZone={handleSelectZone}
              showDebugLabel={showDebug}
            />
          )}
        </div>
      </div>

      {/* ── Zone Info Panel ── */}
      <ZoneInfoPanel zone={selectedZone} onClose={handleClosePanel} />

      {/* ── Footer ── */}
      <footer className="flex items-center justify-between border-t border-white/10 px-6 py-3 font-mono text-[11px] text-zinc-500">
        <span>Drag to rotate · Scroll to zoom · Click zones to inspect</span>
        <span className="text-zinc-600">
          {zones.length > 0
            ? `${zones.length} zones · ${glbUrl ?? "—"}`
            : "—"}
        </span>
      </footer>
    </main>
  );
}
