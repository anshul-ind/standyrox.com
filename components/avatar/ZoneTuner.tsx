"use client";

import { useState } from "react";
import type { ZoneData } from "./ZoneRectangle";

export default function ZoneTuner({
  zones,
  onUpdateZone,
  onClose,
}: {
  zones: ZoneData[];
  onUpdateZone: (updated: ZoneData) => void;
  onClose?: () => void;
}) {
  const [selectedKey, setSelectedKey] = useState<string>(
    zones[0]?.key ?? "chest_center"
  );
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const selectedZone = zones.find((z) => z.key === selectedKey) ?? zones[0];

  if (!selectedZone) return null;

  function handleChange(
    field: "x" | "y" | "z" | "width" | "height",
    val: number
  ) {
    if (!selectedZone) return;
    setSaveStatus(null);
    let updated: ZoneData;
    if (field === "x" || field === "y" || field === "z") {
      updated = {
        ...selectedZone,
        anchor: {
          ...selectedZone.anchor,
          [field]: val,
        },
      };
    } else {
      updated = {
        ...selectedZone,
        size: {
          ...selectedZone.size,
          [field]: val,
        },
      };
    }
    onUpdateZone(updated);
  }

  async function handleSave() {
    if (!selectedZone) return;
    setSaving(true);
    setSaveStatus(null);
    try {
      const res = await fetch(`/api/zones/${selectedZone.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anchorX: selectedZone.anchor.x,
          anchorY: selectedZone.anchor.y,
          anchorZ: selectedZone.anchor.z,
          width: selectedZone.size.width,
          height: selectedZone.size.height,
        }),
      });
      if (!res.ok) throw new Error("Failed to save coordinates");
      setSaveStatus("✓ Saved to DB!");
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      setSaveStatus(
        err instanceof Error ? `Error: ${err.message}` : "Save failed"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed bottom-6 left-6 z-40 w-80 rounded-xl border border-amber-500/30 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur-md text-xs font-mono text-zinc-300">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="font-semibold text-amber-300 tracking-wider uppercase text-[11px]">
            Zone Calibrator
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {/* Zone Selector */}
      <div className="mb-3">
        <label className="block text-[10px] text-zinc-500 mb-1 uppercase">
          Select Zone
        </label>
        <select
          value={selectedKey}
          onChange={(e) => {
            setSelectedKey(e.target.value);
            setSaveStatus(null);
          }}
          className="w-full rounded border border-white/15 bg-zinc-900 px-2 py-1.5 text-zinc-200 focus:border-amber-400 focus:outline-none"
        >
          {zones.map((z) => (
            <option key={z.key} value={z.key}>
              {z.label} ({z.key})
            </option>
          ))}
        </select>
      </div>

      {/* Sliders */}
      <div className="flex flex-col gap-2 mb-3">
        {/* X */}
        <div>
          <div className="flex justify-between text-[10px] text-zinc-400 mb-0.5">
            <span>X (Horizontal)</span>
            <span className="text-amber-300 font-bold">
              {selectedZone.anchor.x.toFixed(3)}
            </span>
          </div>
          <input
            type="range"
            min={-0.9}
            max={0.9}
            step={0.005}
            value={selectedZone.anchor.x}
            onChange={(e) => handleChange("x", parseFloat(e.target.value))}
            className="w-full accent-amber-400 cursor-pointer h-1.5 bg-zinc-800 rounded"
          />
        </div>

        {/* Y */}
        <div>
          <div className="flex justify-between text-[10px] text-zinc-400 mb-0.5">
            <span>Y (Vertical Height)</span>
            <span className="text-amber-300 font-bold">
              {selectedZone.anchor.y.toFixed(3)}
            </span>
          </div>
          <input
            type="range"
            min={0.0}
            max={1.9}
            step={0.005}
            value={selectedZone.anchor.y}
            onChange={(e) => handleChange("y", parseFloat(e.target.value))}
            className="w-full accent-amber-400 cursor-pointer h-1.5 bg-zinc-800 rounded"
          />
        </div>

        {/* Z */}
        <div>
          <div className="flex justify-between text-[10px] text-zinc-400 mb-0.5">
            <span>Z (Front / Back)</span>
            <span className="text-amber-300 font-bold">
              {selectedZone.anchor.z.toFixed(3)}
            </span>
          </div>
          <input
            type="range"
            min={-0.35}
            max={0.35}
            step={0.005}
            value={selectedZone.anchor.z}
            onChange={(e) => handleChange("z", parseFloat(e.target.value))}
            className="w-full accent-amber-400 cursor-pointer h-1.5 bg-zinc-800 rounded"
          />
        </div>

        {/* Width */}
        <div>
          <div className="flex justify-between text-[10px] text-zinc-400 mb-0.5">
            <span>Width</span>
            <span className="text-zinc-300 font-bold">
              {(selectedZone.size.width || 0.15).toFixed(3)}
            </span>
          </div>
          <input
            type="range"
            min={0.05}
            max={0.35}
            step={0.005}
            value={selectedZone.size.width || 0.15}
            onChange={(e) => handleChange("width", parseFloat(e.target.value))}
            className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-zinc-800 rounded"
          />
        </div>

        {/* Height */}
        <div>
          <div className="flex justify-between text-[10px] text-zinc-400 mb-0.5">
            <span>Height</span>
            <span className="text-zinc-300 font-bold">
              {(selectedZone.size.height || 0.15).toFixed(3)}
            </span>
          </div>
          <input
            type="range"
            min={0.05}
            max={0.35}
            step={0.005}
            value={selectedZone.size.height || 0.15}
            onChange={(e) => handleChange("height", parseFloat(e.target.value))}
            className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-zinc-800 rounded"
          />
        </div>
      </div>

      {/* Save Button */}
      <div className="flex flex-col gap-1.5 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded bg-amber-500 py-1.5 text-center font-semibold text-zinc-950 hover:bg-amber-400 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save to Database"}
        </button>
        {saveStatus && (
          <span
            className={`text-center text-[10px] ${
              saveStatus.startsWith("✓") ? "text-green-400" : "text-red-400"
            }`}
          >
            {saveStatus}
          </span>
        )}
      </div>
    </div>
  );
}
