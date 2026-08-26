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
// These x/y values were computed from the SVG's room coordinates and
// will likely need small tweaks if the SVG changes — open the dashboard,
// see where each dot lands relative to its room, and nudge the numbers
// below until they line up.
export const ROOM_POSITIONS = {
  "Arizona Room": { x: 76.9, y: 51.9 },
  "Ballroom": { x: 40, y: 69.9 },
  "Bradshaw Room": { x: 67.5, y: 62.5 },
  "Chino/Prescott Room": { x: 54.7, y: 40 },
  "Copper Basin Room": { x: 13.4, y: 82.7 },
  "Eagle's Nest Lounge": { x: 84.1, y: 29.8 },
  "Firepit": { x: 89.4, y: 9.6 },
  "Foyer": { x: 43.8, y: 87.8 },
  "Granite Mountain Room": { x: 68.1, y: 29.4 },
  "Jerome Room": { x: 54.7, y: 50.3 },
  "Registration": { x: 62.5, y: 82.1 },
};

// Supabase project connection info — from your project's
// Settings > API page. The anon (public) key is meant to be exposed in
// client-side code like this; access is controlled by the Row Level
// Security policies in supabase/schema.sql, not by keeping this secret.
export const SUPABASE_URL = "https://kujlmxpbrvbxovftgudp.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_ISlHtZQyWFBGZNX8Sk8ZqQ__6ALH2kZ";
