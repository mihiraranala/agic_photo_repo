// Rooms shown in the upload form's dropdown, and tracked on the heatmap.
// This matches the labeled spaces on floorplan.jpeg. Edit before the event
// if your venue differs.
export const ROOMS = [
  "Icha Maajoh Room",
  "Granite Mountain",
  "Coomer",
  "Eagle's Nest",
  "Pool",
  "Aerobics",
  "Locker Rooms (Men)",
  "Locker Rooms (Women)",
  "Salon",
  "Casino",
  "Chino",
  "Prescott",
  "Jerome",
  "Arizona Room",
  "Coffee Shop",
  "Front Desk",
  "Main Entrance",
  "Restrooms",
  "Goldwater Ballroom - Clarkdale",
  "Goldwater Ballroom - Cottonwood",
  "Goldwater Ballroom - Sedona",
  "Verde A",
  "Verde B",
  "Copper Basin",
  "Loading Dock",
  "Foyer",
];

// Floor plan image shown top-left on the dashboard. Drop your real floor
// plan image into this repo's root and point this at it.
export const FLOOR_PLAN_IMAGE = "floorplan.jpeg";

// Where each room sits on FLOOR_PLAN_IMAGE, as a percentage of the
// image's width/height (0 = left/top edge, 100 = right/bottom edge).
// This is what the heatmap uses to place each room's "hot spot".
//
// These x/y values were estimated by eye from the floor plan image and
// will likely need small tweaks — open the dashboard, see where each
// dot lands relative to its room label, and nudge the numbers below
// until they line up.
export const ROOM_POSITIONS = {
  "Icha Maajoh Room": { x: 39, y: 22 },
  "Granite Mountain": { x: 50, y: 27 },
  "Coomer": { x: 46, y: 25 },
  "Eagle's Nest": { x: 60, y: 29 },
  "Pool": { x: 70, y: 27 },
  "Aerobics": { x: 80, y: 26 },
  "Locker Rooms (Men)": { x: 78, y: 34 },
  "Locker Rooms (Women)": { x: 82, y: 34 },
  "Salon": { x: 74, y: 43 },
  "Casino": { x: 89, y: 46 },
  "Chino": { x: 43, y: 38 },
  "Prescott": { x: 43, y: 45 },
  "Jerome": { x: 43, y: 51 },
  "Arizona Room": { x: 56, y: 54 },
  "Coffee Shop": { x: 60, y: 56 },
  "Front Desk": { x: 68, y: 53 },
  "Main Entrance": { x: 63, y: 63 },
  "Restrooms": { x: 51, y: 59 },
  "Goldwater Ballroom - Clarkdale": { x: 31, y: 67 },
  "Goldwater Ballroom - Cottonwood": { x: 35, y: 67 },
  "Goldwater Ballroom - Sedona": { x: 39, y: 67 },
  "Verde A": { x: 44, y: 73 },
  "Verde B": { x: 44, y: 63 },
  "Copper Basin": { x: 25, y: 79 },
  "Loading Dock": { x: 17, y: 80 },
  "Foyer": { x: 38, y: 84 },
};

// Firebase project config — replace with the values from your Firebase
// project settings (Project settings > General > Your apps > SDK setup).
// See README.md for step-by-step setup instructions.
export const FIREBASE_CONFIG = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.appspot.com",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME",
};
