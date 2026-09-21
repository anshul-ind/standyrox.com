"use client";

import React, { createContext, useContext, useState, useEffect, useMemo } from "react";

export type ThemeMode = "cyan" | "red";

export interface ThemeColors {
  primary: string; // e.g. #00d4ff or #ff2a55
  primaryHex: number; // 0x00d4ff or 0xff2a55
  primaryGlow: string; // rgba(...)
  borderGlow: string;
  bgDark: string;
  bgPanel: string;
  gridColorHex: number;
  skyMidHex: number;
  skyEdgeHex: number;
  accentBadge: string;
}

const THEME_PRESETS: Record<ThemeMode, ThemeColors> = {
  cyan: {
    primary: "#00d4ff",
    primaryHex: 0x00d4ff,
    primaryGlow: "rgba(0, 212, 255, 0.4)",
    borderGlow: "rgba(0, 212, 255, 0.25)",
    bgDark: "#040911",
    bgPanel: "#081119",
    gridColorHex: 0x1bb8d6,
    skyMidHex: 0x0a1420,
    skyEdgeHex: 0x040911,
    accentBadge: "border-cyan-500/40 bg-cyan-500/15 text-cyan-300",
  },
  red: {
    primary: "#ff2a55",
    primaryHex: 0xff2a55,
    primaryGlow: "rgba(255, 42, 85, 0.4)",
    borderGlow: "rgba(255, 42, 85, 0.25)",
    bgDark: "#100406",
    bgPanel: "#19080b",
    gridColorHex: 0xd61b40,
    skyMidHex: 0x200a0e,
    skyEdgeHex: 0x100406,
    accentBadge: "border-rose-500/40 bg-rose-500/15 text-rose-300",
  },
};

interface ThemeContextType {
  theme: ThemeMode;
  colors: ThemeColors;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "cyan",
  colors: THEME_PRESETS.cyan,
  toggleTheme: () => {},
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("cyan");

  // Load persisted theme preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem("standout_theme") as ThemeMode | null;
      if (saved === "cyan" || saved === "red") {
        setThemeState(saved);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const setTheme = (mode: ThemeMode) => {
    setThemeState(mode);
    try {
      localStorage.setItem("standout_theme", mode);
    } catch {
      // Ignore
    }
  };

  const toggleTheme = () => {
    setTheme(theme === "cyan" ? "red" : "cyan");
  };

  const colors = useMemo(() => THEME_PRESETS[theme], [theme]);

  return (
    <ThemeContext.Provider value={{ theme, colors, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
