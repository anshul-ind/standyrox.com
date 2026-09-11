"use client";

import { useRef } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";

/**
 * Pure visual teaser: static CSS-perspective currency-note card.
 * No click handler, no drawer, no interactive child elements.
 * Cursor tilt stays (±7 deg) — it is purely decorative.
 */
export default function NoteTeaser() {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const springX = useSpring(rawX, { stiffness: 220, damping: 26 });
  const springY = useSpring(rawY, { stiffness: 220, damping: 26 });
  const rotateX = useTransform(springX, [-0.5, 0.5], [7, -7]);
  const rotateY = useTransform(springY, [-0.5, 0.5], [-7, 7]);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (reduceMotion) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    rawY.set((e.clientX - rect.left) / rect.width - 0.5);
    rawX.set((e.clientY - rect.top) / rect.height - 0.5);
  }

  function handleMouseLeave() {
    rawX.set(0);
    rawY.set(0);
  }

  return (
    // pointer-events-none on the outer wrapper prevents any click/tap from
    // reaching this element — it is strictly decorative.
    <div
      aria-hidden="true"
      className="pointer-events-none w-full max-w-lg [perspective:1200px]"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <motion.div
        ref={ref}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="relative aspect-[2.1/1] w-full overflow-hidden rounded-xl border-4 border-double border-amber-200/30 bg-zinc-950 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.9)]"
      >
        {/* radial gradient — gold-green like a real $100 plate */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 85% 75% at 52% 44%, #1a3a1a 0%, #0b1a0b 60%, #000 100%)",
          }}
        />
        {/* paper grain */}
        <div
          className="absolute inset-0 opacity-[0.12] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='0.7'/%3E%3C/svg%3E\")",
          }}
        />
        {/* inner engraved border */}
        <div className="pointer-events-none absolute inset-2 rounded-lg border border-amber-100/10" />
        {/* corner ornaments */}
        {[
          "left-2 top-2 rounded-tl-md border-l border-t",
          "right-2 top-2 rounded-tr-md border-r border-t",
          "bottom-2 left-2 rounded-bl-md border-b border-l",
          "bottom-2 right-2 rounded-br-md border-b border-r",
        ].map((cls) => (
          <div
            key={cls}
            className={`absolute h-8 w-8 border-amber-100/25 ${cls}`}
          />
        ))}
        {/* vignette */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 100% 100% at 50% 50%, transparent 50%, rgba(0,0,0,0.65) 100%)",
          }}
        />
        {/* denomination face text */}
        <div
          className="pointer-events-none absolute inset-0 flex flex-col justify-between p-6"
          style={{ transform: "translateZ(30px)" }}
        >
          <div className="flex items-start justify-between">
            <span className="text-[10px] font-medium tracking-[0.35em] text-amber-100/50 uppercase">
              Stand Out
            </span>
            <span className="font-mono text-xs text-amber-100/60">
              USD · One Hundred Dollars
            </span>
          </div>
          <div className="flex items-end justify-between">
            <span className="font-serif text-5xl font-bold text-amber-100/80 drop-shadow-[0_2px_12px_rgba(0,0,0,0.7)]">
              $100
            </span>
            <span className="font-mono text-[10px] tracking-widest text-amber-100/40 uppercase">
              3D Interactive Simulation →
            </span>
          </div>
        </div>
        {/* decorative "claimed" dots to hint at hotspot system */}
        {[
          { top: "38%", left: "22%" },
          { top: "55%", left: "50%" },
          { top: "42%", left: "74%" },
        ].map((pos, i) => (
          <div
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2 size-6 rounded-full border-2 border-dashed border-amber-300/60"
            style={{ top: pos.top, left: pos.left }}
          />
        ))}
      </motion.div>
    </div>
  );
}
