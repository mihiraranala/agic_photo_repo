// Rooms shown in the upload form's dropdown, and tracked on the heatmap.
// This matches the labeled spaces on floorplan_v2.png (restrooms excluded
// since they're not a photo-worthy destination). Edit before the event if
// your venue differs.
export const ROOMS = [
  "Arizona Room",
  "Ballroom",
  "Bradshaw Room",
  "Chino/Prescott Room",
  "Copper Basin Room",
  "Eagle's Nest Lounge",
  "Foyer",
  "Granite Mountain Room",
  "Jerome Room",
  "Registration",
];

// Floor plan image shown top-left on the dashboard. Drop your real floor
// plan image into this repo's root and point this at it.
export const FLOOR_PLAN_IMAGE = "floorplan_v2.png";

// Where each room sits on FLOOR_PLAN_IMAGE, as a percentage of the
// image's width/height (0 = left/top edge, 100 = right/bottom edge).
// This is what the heatmap uses to place each room's "hot spot".
//
// These x/y values were estimated by eye from the floor plan image and
// will likely need small tweaks — open the dashboard, see where each
// dot lands relative to its room label, and nudge the numbers below
// until they line up.
export const ROOM_POSITIONS = {
  "Arizona Room": { x: 75, y: 44 },
  "Ballroom": { x: 41, y: 58 },
  "Bradshaw Room": { x: 68, y: 60 },
  "Chino/Prescott Room": { x: 55, y: 33 },
  "Copper Basin Room": { x: 16, y: 68 },
  "Eagle's Nest Lounge": { x: 85, y: 22 },
  "Foyer": { x: 46, y: 70 },
  "Granite Mountain Room": { x: 70, y: 22 },
  "Jerome Room": { x: 55, y: 42 },
  "Registration": { x: 64, y: 67 },
};

// Supabase project connection info — from your project's
// Settings > API page. The anon (public) key is meant to be exposed in
// client-side code like this; access is controlled by the Row Level
// Security policies in supabase/schema.sql, not by keeping this secret.
export const SUPABASE_URL = "https://kujlmxpbrvbxovftgudp.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_ISlHtZQyWFBGZNX8Sk8ZqQ__6ALH2kZ";
