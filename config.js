// Rooms shown in the upload form's dropdown, and tracked on the heatmap.
// This matches the taggable spaces on the floor plan SVG in index.html
// (restrooms excluded since they're not a photo-worthy destination).
// Edit before the event if your venue differs.
export const ROOMS = [
  "Arizona Room",
  "Ballroom",
  "Bradshaw Room",
  "Chino/Prescott Room",
  "Copper Basin Room",
  "Eagle's Nest Lounge",
  "Firepit",
  "Foyer",
  "Granite Mountain Room",
  "Jerome Room",
  "Registration",
];

// The floor plan itself is the inline <svg id="floorplan-map"> in
// index.html (viewBox 0 0 1600 1560) — a hand-drawn "futuristic" venue
// diagram, not generated from data. If you redraw it for a different
// venue, update these to match the new layout.

// Where each room sits on the floor plan, as a percentage of the SVG
// viewBox's width/height (0 = left/top edge, 100 = right/bottom edge).
// This is what the heatmap and photo markers use to place each room's
// "hot spot" — should land at/near the center of that room's shape in
// the SVG.
//
// These x/y values are the geometric centers of each room's actual
// <rect>/<path> shape in the SVG (bounding-box center for rects, true
// polygon centroid for the irregular ones) — not eyeballed from where
// each room's text label happens to sit, since a label's position is
// often nudged off-center for legibility and that offset otherwise ends
// up baked into every dot. If you redraw the SVG, recompute these from
// the new shapes rather than from where the new labels land.
export const ROOM_POSITIONS = {
  "Arizona Room": { x: 76.9, y: 51.9 },
  "Ballroom": { x: 40, y: 69.9 },
  "Bradshaw Room": { x: 67.5, y: 62.5 },
  "Chino/Prescott Room": { x: 54.8, y: 39.1 },
  "Copper Basin Room": { x: 13.4, y: 82.7 },
  "Eagle's Nest Lounge": { x: 84.1, y: 29.8 },
  "Firepit": { x: 89.4, y: 9.6 },
  "Foyer": { x: 41.6, y: 87.2 },
  "Granite Mountain Room": { x: 68.5, y: 28.5 },
  "Jerome Room": { x: 54.7, y: 50.3 },
  "Registration": { x: 62.5, y: 82.1 },
};

// Supabase project connection info — from your project's
// Settings > API page. The anon (public) key is meant to be exposed in
// client-side code like this; access is controlled by the Row Level
// Security policies in supabase/schema.sql, not by keeping this secret.
export const SUPABASE_URL = "https://kujlmxpbrvbxovftgudp.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_ISlHtZQyWFBGZNX8Sk8ZqQ__6ALH2kZ";
