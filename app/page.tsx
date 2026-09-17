"use client";

import { useEffect, useState, useCallback } from "react";

import AvatarScene from "@/components/avatar/AvatarScene";
import type { ZoneData } from "@/components/avatar/AvatarScene";
import ZoneInfoPanel from "@/components/avatar/ZoneInfoPanel";
import type { ZoneDetail } from "@/components/avatar/ZoneInfoPanel";
import ZoneTuner from "@/components/avatar/ZoneTuner";
import ErrorBoundary from "@/components/ui/error-boundary";

export default function Home() {
  const [zones, setZones] = useState<ZoneData[]>([]);
  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [selectedZone, setSelectedZone] = useState<ZoneDetail | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Fetch zones on mount (and on Retry)
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
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load zones");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

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

  const handleUpdateZone = useCallback((updated: ZoneData) => {
    setZones((prev) => prev.map((z) => (z.id === updated.id ? updated : z)));
  }, []);

  return (
    <main className="flex min-h-screen flex-col text-amber-50 bg-cover bg-center bg-no-repeat relative" style={{ backgroundImage: 'url(/bg.jpg)' }}>
      {/* Overlay to ensure the UI remains readable against the new background */}
      <div className="absolute inset-0 bg-black/30 pointer-events-none z-0" />
      
      {/* ── Header ── */}
      <header className="relative z-10 flex items-center justify-between border-b border-cyan-900/40 px-6 py-3" style={{ background: 'rgba(5,12,26,0.85)', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-bold tracking-[0.32em] uppercase" style={{ color: '#00d4ff', textShadow: '0 0 12px rgba(0,212,255,0.5)' }}>
            Stand Out
          </span>
          <span className="text-cyan-900">|</span>
          <span className="text-sm text-slate-400 tracking-wide">
            Avatar Ad-Zone Marketplace
          </span>
        </div>
        <button
          suppressHydrationWarning
          type="button"
          onClick={() => setShowDebug((prev) => !prev)}
          className={`rounded-full border px-3 py-1 font-mono text-[11px] transition-colors ${
            showDebug
              ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-300"
              : "border-cyan-900/50 bg-slate-900/60 text-slate-400 hover:text-slate-200"
          }`}
        >
          Debug: {showDebug ? "ON" : "OFF"}{" "}
          <span className="text-slate-600">(Ctrl+D)</span>
        </button>
      </header>

      {/* ── 3D Scene ── */}
      <div className="relative flex-1" style={{ minHeight: "80vh" }}>
        {/* Background glow removed in favor of main bg image */}

        <div className="absolute inset-0 z-10">
          {loading ? (
            <div className="flex h-full w-full items-center justify-center">
              <div className="w-full max-w-md space-y-4 px-6">
                <div className="h-3 w-2/3 animate-pulse rounded-full bg-zinc-800" />
                <div className="h-3 w-1/2 animate-pulse rounded-full bg-zinc-800" />
                <div className="mx-auto mt-8 h-40 w-40 animate-pulse rounded-full bg-zinc-800/70" />
                <div className="mx-auto h-2 w-24 animate-pulse rounded-full bg-zinc-700" />
              </div>
            </div>
          ) : error ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6 text-center">
              <p className="font-mono text-sm text-red-400">{error}</p>
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  setReloadKey((k) => k + 1);
                }}
                className="rounded-lg border border-white/10 bg-zinc-800 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
              >
                Try again
              </button>
            </div>
          ) : (
            <ErrorBoundary fallbackTitle="Failed to load the 3D viewer.">
              <AvatarScene
                zones={zones}
                onSelectZone={handleSelectZone}
                showDebugLabel={showDebug}
              />
            </ErrorBoundary>
          )}
        </div>
      </div>

      {/* ── Zone Info Panel ── */}
      <ZoneInfoPanel zone={selectedZone} onClose={handleClosePanel} />

      {/* ── Zone Tuner Calibration Tool ── */}
      {showDebug && (
        <ZoneTuner
          zones={zones}
          onUpdateZone={handleUpdateZone}
          onClose={() => setShowDebug(false)}
        />
      )}

      {/* ── Footer ── */}
      <footer className="relative z-10 flex items-center justify-between border-t border-cyan-900/30 px-6 py-3 font-mono text-[11px]" style={{ background: 'rgba(5,12,26,0.85)', backdropFilter: 'blur(12px)', color: '#3a6070' }}>
        <span>Drag to rotate · Scroll to zoom · Click zones to inspect</span>
        <span style={{ color: '#1e4455' }}>
          {zones.length > 0
            ? `${zones.length} zones · ${glbUrl ?? "—"}`
            : "—"}
        </span>
      </footer>
    </main>
  );
}
