"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import type { GeoJsonFeatureCollection } from "@/lib/types";

// Fix default marker icon issues with React-Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
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

// A component to track map bounds
function MapBoundsTracker({ onBoundsChange }: { onBoundsChange?: (bounds: any) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!onBoundsChange) return;
    const updateBounds = () => {
      const bounds = map.getBounds();
      onBoundsChange({
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      });
    };
    map.on("moveend", updateBounds);
    updateBounds(); // initial
    return () => {
      map.off("moveend", updateBounds);
    };
  }, [map, onBoundsChange]);
  return null;
}

// Heatmap Layer Component using leaflet.heat
function HeatmapLayer({ geojson, metric }: { geojson: GeoJsonFeatureCollection; metric: string }) {
  const map = useMap();
  
  useEffect(() => {
    if (!geojson || !geojson.features.length) return;
    
    // Extract centroids or coordinates for heat points
    const points: [number, number, number][] = [];
    geojson.features.forEach((feature: any) => {
      const props = feature.properties || {};
      const val = typeof props[metric] === "number" ? props[metric] : 0;
      
      // Calculate a rough centroid from Polygon coordinates
      if (feature.geometry.type === "Polygon") {
        const coords = feature.geometry.coordinates[0];
        if (coords && coords.length > 0) {
          let lngSum = 0, latSum = 0;
          coords.forEach((pt: number[]) => { lngSum += pt[0]; latSum += pt[1]; });
          points.push([latSum / coords.length, lngSum / coords.length, val / 100]); // Normalize intensity roughly
        }
      } else if (feature.geometry.type === "Point") {
        points.push([feature.geometry.coordinates[1], feature.geometry.coordinates[0], val / 100]);
      }
    });
    
    if (points.length === 0) return;
    
    const heatLayer = (L as any).heatLayer(points, {
      radius: 25,
      blur: 15,
      maxZoom: 12,
      max: 1.0,
      gradient: {
        0.0: "rgba(14,184,166,0)",
        0.3: "rgba(20,184,166,0.7)",
        0.6: "rgba(245,158,11,0.8)",
        1.0: "rgba(244,63,94,0.9)",
      }
    }).addTo(map);
    
    return () => {
      map.removeLayer(heatLayer);
    };
  }, [map, geojson, metric]);
  
  return null;
}

export default function CityMapClient({
  geojson,
  markers = [],
  center = [77.2, 28.65],
  zoom = 10,
  className = "h-96",
  layerType = "fill",
  metric = "intensity",
  onZoneClick,
  onBoundsChange,
}: CityMapProps) {
  
  // Note: react-leaflet center expects [lat, lng] unlike Mapbox [lng, lat]
  const leafletCenter: [number, number] = [center[1], center[0]];

  // Pre-calculate top 5 zones to match hotspot colors
  const topZones = useMemo(() => {
    if (!geojson || !geojson.features) return [];
    return [...geojson.features]
      .sort((a, b) => {
        const valA = typeof a.properties?.[metric] === "number" ? a.properties[metric] : 0;
        const valB = typeof b.properties?.[metric] === "number" ? b.properties[metric] : 0;
        return valB - valA;
      })
      .slice(0, 5)
      .map(f => f.properties?.zone_id);
  }, [geojson, metric]);

  // Style for GeoJSON fill (Chloropleth)
  const getStyle = (feature: any) => {
    const props = feature.properties || {};
    const zoneId = props.zone_id;
    
    let color = "#1a2236";
    
    const rankIndex = topZones.indexOf(zoneId);
    if (rankIndex !== -1) {
      const colors = ["#14b8a6", "#0ea5e9", "#8b5cf6", "#f59e0b", "#f43f5e"];
      color = colors[rankIndex];
    }
    
    return {
      fillColor: color,
      weight: 1,
      opacity: 1,
      color: "rgba(99,130,180,0.35)", // stroke color
      fillOpacity: 0.65
    };
  };

  const onEachFeature = (feature: any, layer: L.Layer) => {
    const props = feature.properties || {};
    
    // Popup content
    const popupContent = `
      <div style="font-family:Inter,sans-serif">
        <div style="font-size:13px;font-weight:700;margin-bottom:8px;color:#333">
          ${props.zone_name || props.zone_id || "Zone"}
        </div>
        ${Object.entries(props)
          .filter(([k]) => !["zone_name","geometry","type"].includes(k))
          .slice(0, 5)
          .map(([k, v]) =>
            `<div style="display:flex;justify-content:space-between;font-size:11px;padding:2px 0;color:#555">
              <span>${k.replace(/_/g," ")}</span>
              <span style="font-weight:600;color:#222">${typeof v === "number" ? Number(v).toFixed(1) : v}</span>
            </div>`
          ).join("")}
      </div>
    `;
    
    layer.bindPopup(popupContent);
    
    layer.on({
      click: () => {
        if (onZoneClick) onZoneClick(props);
      },
      mouseover: (e) => {
        const target = e.target;
        target.setStyle({
          weight: 2,
          color: '#666',
          fillOpacity: 0.7
        });
        target.bringToFront();
      },
      mouseout: (e) => {
        // Reset style
        const target = e.target;
        target.setStyle(getStyle(feature));
      }
    });
  };

  return (
    <div className={`${className} overflow-hidden rounded-xl z-0 relative`} style={{ border: "1px solid var(--city-border)" }}>
      <MapContainer 
        center={leafletCenter} 
        zoom={zoom} 
        scrollWheelZoom={true} 
        style={{ height: "100%", width: "100%", background: "#0a0f1e" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> CartoDB'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        
        <MapBoundsTracker onBoundsChange={onBoundsChange} />

        {geojson && layerType === "heatmap" && (
          <HeatmapLayer geojson={geojson} metric={metric} />
        )}

        {geojson && layerType !== "heatmap" && (
          <GeoJSON 
            key={geojson.features.map((f: any) => f.properties?.zone_id).join('-')}
            data={geojson} 
            style={getStyle} 
            onEachFeature={onEachFeature} 
          />
        )}

        {markers.map((m, idx) => {
          // Custom colored circle marker or generic marker
          const iconHtml = `
            <div style="
              width:16px;height:16px;border-radius:50%;
              background:${m.color || "#14b8a6"};
              box-shadow:0 0 16px ${m.color || "#14b8a6"}88;
              border:2px solid rgba(255,255,255,0.3);
            "></div>
          `;
          const customIcon = L.divIcon({
            html: iconHtml,
            className: "",
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          });
          
          return (
            <Marker key={idx} position={[m.lat, m.lng]} icon={customIcon}>
              {m.popup && (
                <Popup>
                  <div style={{ fontFamily: "Inter", fontSize: "12px", color: "#333" }}>{m.popup}</div>
                </Popup>
              )}
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
