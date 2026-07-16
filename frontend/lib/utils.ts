import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes safely — resolves conflicts and deduplicates.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Default city ID used when no city context is selected. */
export const cityId =
  process.env.NEXT_PUBLIC_DEFAULT_CITY_ID || "metro-city-01";

/** Format large numbers with K/M suffix. */
export function formatNumber(value: number, decimals = 1): string {
  if (!isFinite(value)) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(decimals)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(decimals)}K`;
  return Number(value).toFixed(decimals);
}

/** Format ISO date string to readable label. */
export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/** Map risk level string to its CSS color variable. */
export function riskColor(level: string): string {
  const map: Record<string, string> = {
    low: "#2dd4bf",
    medium: "#fbbf24",
    high: "#fb923c",
    critical: "#fb7185",
  };
  return map[level?.toLowerCase()] ?? "#94a3b8";
}

/**
 * Return a CSS color for a numeric delta.
 * @param value   The delta value.
 * @param inverse When true, negative delta is "good" (e.g. pollution decrease).
 */
export function deltaColor(value: number, inverse = false): string {
  if (Math.abs(value) < 0.1) return "var(--city-text-muted)";
  const isPositive = value > 0;
  const isGood = inverse ? !isPositive : isPositive;
  return isGood ? "#2dd4bf" : "#fb7185";
}

/** Clamp a number between min and max. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Sleep for ms milliseconds (useful in async polling). */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
