"use client";

import { useEffect, useState, useCallback } from "react";

import AvatarScene from "@/components/avatar/AvatarScene";
import type { ZoneData } from "@/components/avatar/AvatarScene";
import ZoneInfoPanel from "@/components/avatar/ZoneInfoPanel";
import type { ZoneDetail } from "@/components/avatar/ZoneInfoPanel";
import ZoneTuner from "@/components/avatar/ZoneTuner";
import ErrorBoundary from "@/components/ui/error-boundary";
import { ThemeProvider, useTheme } from "@/lib/theme-context";
import AudioController, { playSoundFX } from "@/components/ui/AudioController";

function HomeContent() {
  const { theme, colors, toggleTheme } = useTheme();
  const [zones, setZones] = useState<ZoneData[]>([]);
  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [selectedZone, setSelectedZone] = useState<ZoneDetail | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const isRed = theme === "red";

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

  const handleToggleTheme = () => {
    playSoundFX("toggle");
    toggleTheme();
  };

  return (
    <main
      className="flex min-h-screen flex-col text-amber-50 transition-colors duration-500"
      style={{ background: colors.bgDark }}
    >
      {/* ── Header ── */}
      <header
        className="flex items-center justify-between border-b px-6 py-3 transition-colors duration-500"
        style={{
          background: isRed ? "rgba(18, 4, 7, 0.94)" : "rgba(5, 12, 26, 0.94)",
          borderColor: isRed ? "rgba(255, 42, 85, 0.25)" : "rgba(0, 212, 255, 0.25)",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Left Side: Brand Logo + Theme Toggle */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <img
              src="/svg/anshul_dummy.png"
              alt="Avatar Logo"
              className="h-6 w-6 rounded-full object-cover border"
              style={{
                borderColor: colors.primary,
                boxShadow: `0 0 8px ${colors.primaryGlow}`,
              }}
            />
            <span
              className="text-[13px] font-bold tracking-[0.35em] uppercase transition-colors duration-500"
              style={{
                color: colors.primary,
                textShadow: `0 0 14px ${colors.primaryGlow}`,
              }}
            >
              Stand Out
            </span>
            <span className="text-zinc-700">|</span>
            <span className="hidden sm:inline text-xs text-zinc-400 font-mono tracking-wider">
              3D Avatar Ad-Zone
            </span>
          </div>

          {/* Theme Toggle Button in Top-Left */}
          <button
            type="button"
            onClick={handleToggleTheme}
            title="Toggle Cyan / Red Theme"
            className={`group flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] font-semibold transition-all duration-300 ${
              isRed
                ? "border-rose-500/50 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 shadow-[0_0_15px_rgba(255,42,85,0.25)]"
                : "border-cyan-400/50 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/20 shadow-[0_0_15px_rgba(0,212,255,0.25)]"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full transition-all duration-300 ${
                isRed ? "bg-rose-500 shadow-[0_0_8px_#ff2a55]" : "bg-cyan-400 shadow-[0_0_8px_#00d4ff]"
              }`}
            />
            <span>{isRed ? "THEME: RED" : "THEME: CYAN"}</span>
          </button>
        </div>

        {/* Right Side: Audio Controller + Debug Switch */}
        <div className="flex items-center gap-3">
          <AudioController />

          <button
            type="button"
            onClick={() => setShowDebug((prev) => !prev)}
            className={`rounded-full border px-3 py-1 font-mono text-[11px] transition-colors ${
              showDebug
                ? isRed
                  ? "border-rose-400/60 bg-rose-400/15 text-rose-300"
                  : "border-cyan-400/60 bg-cyan-400/15 text-cyan-300"
                : "border-white/10 bg-slate-900/60 text-slate-400 hover:text-slate-200"
            }`}
          >
            Debug: {showDebug ? "ON" : "OFF"}{" "}
            <span className="text-zinc-500 hidden sm:inline">(Ctrl+D)</span>
          </button>
        </div>
      </header>

      {/* ── 3D Scene ── */}
      <div className="relative flex-1" style={{ minHeight: "80vh" }}>
        {/* Ambient background glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-700"
          style={{
            background: isRed
              ? "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(255,42,85,0.06) 0%, transparent 70%)"
              : "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(0,212,255,0.06) 0%, transparent 70%)",
          }}
        />

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
                selectedZone={selectedZone}
                showDebugLabel={showDebug}
              />
            </ErrorBoundary>
          )}
        </div>
      </div>

      {/* ── Zone Info Panel / Glass Brand Card ── */}
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
      <footer
        className="flex items-center justify-between border-t px-6 py-3 font-mono text-[11px] transition-colors duration-500"
        style={{
          background: isRed ? "rgba(18, 4, 7, 0.94)" : "rgba(5, 12, 26, 0.94)",
          borderColor: isRed ? "rgba(255, 42, 85, 0.2)" : "rgba(0, 212, 255, 0.2)",
          color: isRed ? "#8a3545" : "#3a6070",
        }}
      >
        <span>Drag left/right to rotate 360° · Scroll to zoom · Click spots for 3D camera focus</span>
        <span style={{ color: isRed ? "#6a2535" : "#1e4455" }}>
          {zones.length > 0 ? `${zones.length} zones active` : "—"}
        </span>
      </footer>
    </main>
  );
}

export default function Home() {
  return (
    <ThemeProvider>
      <HomeContent />
    </ThemeProvider>
  );
}
