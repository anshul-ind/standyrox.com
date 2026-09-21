"use client";

import React, { useState, useEffect, useRef } from "react";
import { useTheme } from "@/lib/theme-context";

// ─── Web Audio API Sound FX Synthesizer ───────────────────────────────────────
// Generates clean, futuristic UI audio chimes without latency or missing files
export function playSoundFX(type: "select" | "toggle" | "close" | "focus") {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    if (type === "select") {
      // Futuristic ascending chime
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.16);
    } else if (type === "toggle") {
      // Cyberpunk mode switch sweep
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(640, ctx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } else if (type === "focus") {
      // Smooth focus radar ping
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(554.37, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.26);
    } else if (type === "close") {
      // Gentle dismiss
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.13);
    }
  } catch {
    // AudioContext blocked or not supported
  }
}

export default function AudioController() {
  const { theme, colors } = useTheme();
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.35);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio("/assets/bgm.mp3");
    audio.loop = true;
    audio.volume = volume;
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.volume = volume;
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          // Autoplay policy
        });
    }
    playSoundFX("toggle");
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
    }
    if (val > 0 && !isPlaying && audioRef.current) {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const isRed = theme === "red";

  return (
    <div className="flex items-center gap-2">
      {/* Audio Toggle Button */}
      <button
        type="button"
        onClick={togglePlay}
        title={isPlaying ? "Mute Cyber BGM" : "Play Cyber BGM"}
        className={`group relative flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] transition-all duration-300 ${
          isPlaying
            ? isRed
              ? "border-rose-500/60 bg-rose-500/15 text-rose-300 shadow-[0_0_12px_rgba(255,42,85,0.3)]"
              : "border-cyan-400/60 bg-cyan-400/15 text-cyan-300 shadow-[0_0_12px_rgba(0,212,255,0.3)]"
            : "border-white/10 bg-slate-900/60 text-slate-400 hover:border-white/20 hover:text-slate-200"
        }`}
      >
        {/* Animated Equalizer Bars */}
        <div className="flex items-end gap-[2px] h-3 w-3">
          <span
            className={`w-[2px] rounded-full transition-all duration-300 ${
              isPlaying
                ? isRed
                  ? "bg-rose-400 animate-pulse h-3"
                  : "bg-cyan-400 animate-pulse h-3"
                : "bg-slate-500 h-1"
            }`}
            style={{ animationDelay: "0ms" }}
          />
          <span
            className={`w-[2px] rounded-full transition-all duration-300 ${
              isPlaying
                ? isRed
                  ? "bg-rose-400 animate-pulse h-2"
                  : "bg-cyan-400 animate-pulse h-2"
                : "bg-slate-500 h-1.5"
            }`}
            style={{ animationDelay: "150ms" }}
          />
          <span
            className={`w-[2px] rounded-full transition-all duration-300 ${
              isPlaying
                ? isRed
                  ? "bg-rose-400 animate-pulse h-3"
                  : "bg-cyan-400 animate-pulse h-3"
                : "bg-slate-500 h-1"
            }`}
            style={{ animationDelay: "300ms" }}
          />
        </div>
        <span>{isPlaying ? "AUDIO ON" : "AUDIO OFF"}</span>
      </button>

      {/* Volume slider (subtle on hover/expand) */}
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={volume}
        onChange={handleVolumeChange}
        title={`Volume: ${Math.round(volume * 100)}%`}
        className={`w-14 h-1.5 rounded-lg appearance-none cursor-pointer opacity-70 hover:opacity-100 transition-opacity ${
          isRed ? "accent-rose-500 bg-rose-950/40" : "accent-cyan-400 bg-cyan-950/40"
        }`}
      />
    </div>
  );
}
