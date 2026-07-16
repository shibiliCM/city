"use client";

import dynamic from "next/dynamic";
import type { GeoJsonFeatureCollection } from "@/lib/types";

// Dynamically import the Leaflet map to disable SSR
const DynamicCityMapClient = dynamic(() => import("./CityMapClient"), {
  ssr: false,
  loading: () => (
    <div 
      className="h-96 overflow-hidden rounded-xl bg-gray-900 flex items-center justify-center"
      style={{ border: "1px solid var(--city-border)" }}
    >
      <div className="flex flex-col items-center text-slate-500">
        <span className="animate-spin inline-block w-6 h-6 border-2 border-slate-600 border-t-slate-400 rounded-full mb-2" />
        <span className="text-sm">Loading map...</span>
      </div>
    </div>
  )
});

interface CityMapProps {
  geojson?: GeoJsonFeatureCollection;
  markers?: Array<{ lng: number; lat: number; popup?: string; color?: string }>;
  center?: [number, number];
  zoom?: number;
  className?: string;
  layerType?: "heatmap" | "fill" | "circle";
  metric?: string;
  onZoneClick?: (zone: Record<string, unknown>) => void;
  onBoundsChange?: (bounds: { west: number; south: number; east: number; north: number }) => void;
}

export function CityMap(props: CityMapProps) {
  return <DynamicCityMapClient {...props} />;
}
