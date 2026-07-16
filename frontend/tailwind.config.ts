import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        sans: ["var(--font-sans)", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        prism: {
          violet: "#7C5CFC",
          traffic: "#FF8A3D",
          pollution: "#34D399",
          population: "#38BDF8",
          accident: "#FB7185",
          transport: "#FBBF24",
        },
        city: {
          bg:       "#0a0f1e",
          surface:  "#111827",
          surface2: "#1a2236",
          surface3: "#1f2d42",
          border:   "rgba(99,130,180,0.18)",
          ink:      "#e2e8f0",
          dim:      "#94a3b8",
          muted:    "#475569",
          teal:     "#14b8a6",
          amber:    "#f59e0b",
          coral:    "#f43f5e",
          blue:     "#3b82f6",
          violet:   "#8b5cf6",
          line:     "rgba(99,130,180,0.18)",
          panel:    "#111827",
        },
      },
      backgroundImage: {
        "prism-traffic": "linear-gradient(135deg, #7C5CFC 0%, #FF8A3D 100%)",
        "prism-pollution": "linear-gradient(135deg, #7C5CFC 0%, #34D399 100%)",
        "prism-population": "linear-gradient(135deg, #7C5CFC 0%, #38BDF8 100%)",
        "prism-accident": "linear-gradient(135deg, #7C5CFC 0%, #FB7185 100%)",
        "prism-transport": "linear-gradient(135deg, #7C5CFC 0%, #FBBF24 100%)",
      },
      screens: {
        xs: "480px",
      },
      animation: {
        "fade-in":   "fade-in 0.35s ease both",
        "slide-in":  "slide-in 0.25s ease both",
        "spin-slow": "spin 2s linear infinite",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in": {
          from: { opacity: "0", transform: "translateX(-12px)" },
          to:   { opacity: "1", transform: "translateX(0)" },
        },
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};

export default config;
