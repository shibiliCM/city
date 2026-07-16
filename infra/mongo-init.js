// MongoDB initialization script
// Runs once when the container is first created.
// Creates the citytwin database with seed zones for Metro City.

db = db.getSiblingDB("citytwin");

// ─── Seed city zones ──────────────────────────────────────────────────────────
const zones = [
  { zone_id: "zone-1",          name: "Central Business District", area_sqkm: 12.4,  population: 145000, lat: 28.65, lng: 77.22 },
  { zone_id: "zone-2",          name: "North Residential",         area_sqkm: 18.7,  population: 210000, lat: 28.71, lng: 77.18 },
  { zone_id: "zone-3",          name: "South Industrial",          area_sqkm: 22.1,  population: 85000,  lat: 28.58, lng: 77.20 },
  { zone_id: "downtown",        name: "Downtown Core",             area_sqkm: 8.2,   population: 98000,  lat: 28.64, lng: 77.21 },
  { zone_id: "north-sector",    name: "North Sector",              area_sqkm: 31.5,  population: 320000, lat: 28.74, lng: 77.16 },
  { zone_id: "industrial-belt", name: "Industrial Belt",           area_sqkm: 45.3,  population: 62000,  lat: 28.55, lng: 77.25 },
  { zone_id: "east-suburbs",    name: "East Suburbs",              area_sqkm: 28.8,  population: 185000, lat: 28.66, lng: 77.30 },
  { zone_id: "west-end",        name: "West End",                  area_sqkm: 19.4,  population: 142000, lat: 28.62, lng: 77.14 },
];

const cityId = "metro-city-01";

zones.forEach((zone) => {
  const { lat, lng, ...rest } = zone;
  db.city_zones.updateOne(
    { city_id: cityId, zone_id: zone.zone_id },
    {
      $set: {
        city_id: cityId,
        ...rest,
        geometry: {
          type: "Polygon",
          coordinates: [[
            [lng - 0.03, lat - 0.03],
            [lng + 0.03, lat - 0.03],
            [lng + 0.03, lat + 0.03],
            [lng - 0.03, lat + 0.03],
            [lng - 0.03, lat - 0.03],
          ]],
        },
        centroid: { type: "Point", coordinates: [lng, lat] },
        updated_at: new Date(),
      },
      $setOnInsert: { created_at: new Date() },
    },
    { upsert: true }
  );
});

print(`[citytwin-init] Seeded ${zones.length} zones for city: ${cityId}`);

// ─── Indexes ──────────────────────────────────────────────────────────────────
db.city_zones.createIndex({ city_id: 1, zone_id: 1 }, { unique: true });
db.city_zones.createIndex({ centroid: "2dsphere" });
db.datasets.createIndex({ city_id: 1, type: 1, status: 1 });
db.forecasts.createIndex({ zone_id: 1, forecast_type: 1, created_at: -1 });
db.simulations.createIndex({ city_id: 1, created_at: -1 });
db.jobs.createIndex({ job_id: 1 }, { unique: true });
db.jobs.createIndex({ created_at: 1 }, { expireAfterSeconds: 604800 }); // TTL: 7 days
db.users.createIndex({ email: 1 }, { unique: true });
db.chat_sessions.createIndex({ session_id: 1, user_id: 1 });
db.reports.createIndex({ city_id: 1, created_at: -1 });
db.planning_recommendations.createIndex({ city_id: 1, created_at: -1 });

print("[citytwin-init] Indexes created successfully.");
