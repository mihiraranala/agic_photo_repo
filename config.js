// Rooms shown in the upload form's dropdown, and tracked on the heatmap.
// This matches the taggable spaces on the CSS floor plan below
// (restrooms excluded since they're not a photo-worthy destination).
// Edit before the event if your venue differs.
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

// The floor plan is built from CSS (see ROOM_SHAPES/MAP_CONTEXT below)
// rather than an image, so this app has no venue photo/scan to keep in
// sync — everything about the layout lives here in config.js.

// Where each room sits on the floor plan, as a percentage of the map's
// width/height (0 = left/top edge, 100 = right/bottom edge). This is
// what the heatmap and photo markers use to place each room's "hot
// spot" — should land at/near the center of that room's ROOM_SHAPES box.
//
// These x/y values were estimated by eye and will likely need small
// tweaks — open the dashboard, see where each dot lands relative to its
// room's box, and nudge the numbers below until they line up.
export const ROOM_POSITIONS = {
  "Arizona Room": { x: 75.5, y: 43.5 },
  "Ballroom": { x: 40.5, y: 57 },
  "Bradshaw Room": { x: 67.5, y: 63 },
  "Chino/Prescott Room": { x: 55.5, y: 33.5 },
  "Copper Basin Room": { x: 15, y: 67.5 },
  "Eagle's Nest Lounge": { x: 85.5, y: 25 },
  "Foyer": { x: 43, y: 70 },
  "Granite Mountain Room": { x: 69.5, y: 23.5 },
  "Jerome Room": { x: 55.5, y: 43 },
  "Registration": { x: 66, y: 68 },
};

// Bounding box (percentage of the map's width/height) for each taggable
// room's block on the CSS floor plan, plus a `category` picking one of
// the legend colors below. "Registration" is deliberately absent — the
// source floor plan marks it as a small pin/pointer rather than a
// room-sized block, so it's drawn from ROOM_POSITIONS.Registration
// instead (see renderFloorPlanMap() in app.js).
//
// Simplified rectangles, not exact room outlines — estimated by eye the
// same way ROOM_POSITIONS is; nudge left/top/width/height until each
// block lines up with the real venue layout.
export const ROOM_SHAPES = {
  "Granite Mountain Room": { left: 60, top: 14, width: 19, height: 19, category: "session" },
  "Eagle's Nest Lounge": { left: 79, top: 16, width: 13, height: 18, category: "gallery" },
  "Chino/Prescott Room": { left: 51, top: 27.5, width: 9, height: 12, category: "session" },
  "Jerome Room": { left: 51, top: 39.5, width: 9, height: 7, category: "speaker" },
  "Arizona Room": { left: 70, top: 39, width: 11, height: 9, category: "workshop" },
  "Bradshaw Room": { left: 65, top: 60, width: 5, height: 6, category: "staff" },
  "Ballroom": { left: 21, top: 48, width: 39, height: 18, category: "keynote" },
  "Copper Basin Room": { left: 9, top: 61, width: 12, height: 13, category: "session" },
  "Foyer": { left: 21, top: 66, width: 44, height: 8, category: "gallery" },
};

// Legend key for the six ROOM_SHAPES categories, shown in the map's
// corner legend card — matches the categories on the original venue map.
export const ROOM_CATEGORIES = [
  { key: "keynote", label: "Keynote, Luncheons, Exhibits, Exhibitor Social" },
  { key: "session", label: "Breakout, Technical, and Panel Sessions" },
  { key: "workshop", label: "Hands-On Workshop Lab" },
  { key: "gallery", label: "Map Gallery, Registration" },
  { key: "speaker", label: "Speaker Prep Room" },
  { key: "staff", label: "Conference Staff" },
];

// Non-taggable context shown on the map for orientation only (not
// clickable, not part of ROOMS/the upload dropdown) — restrooms, the
// firepit, and the two directional signs from the original venue map.
export const MAP_CONTEXT = [
  { type: "box", left: 65, top: 43.5, width: 5, height: 16, label: "Restrooms", icon: "🚻" },
  { type: "icon", left: 86, top: 5, width: 8, height: 7, label: "Firepit", icon: "🔥" },
  { type: "arrow", left: 69, top: 34, width: 22, height: 3, label: "To Hotel Lobby, Guest Rooms, and Casino", direction: "right" },
  { type: "arrow", left: 12, top: 78, width: 28, height: 3, label: "To South Parking Lot", direction: "left" },
];

// Supabase project connection info — from your project's
// Settings > API page. The anon (public) key is meant to be exposed in
// client-side code like this; access is controlled by the Row Level
// Security policies in supabase/schema.sql, not by keeping this secret.
export const SUPABASE_URL = "https://kujlmxpbrvbxovftgudp.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_ISlHtZQyWFBGZNX8Sk8ZqQ__6ALH2kZ";
