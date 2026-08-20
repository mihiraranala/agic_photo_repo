// Rooms shown in the upload form's dropdown, and tracked on the heatmap.
// Edit this list before the event.
export const ROOMS = ["Room A", "Room B", "Room C"];

// Floor plan image shown top-left on the dashboard. Drop your real floor
// plan image into this repo and point this at it (e.g. "floorplan.png").
// A placeholder SVG ships at this path so the dashboard renders out of
// the box — swap the file and update ROOM_POSITIONS below to match.
export const FLOOR_PLAN_IMAGE = "floorplan.svg";

// Where each room sits on FLOOR_PLAN_IMAGE, as a percentage of the
// image's width/height (0 = left/top edge, 100 = right/bottom edge).
// This is what the heatmap uses to place each room's "hot spot" — after
// you swap in a real floor plan, eyeball the room centers on the new
// image and update x/y here to match.
export const ROOM_POSITIONS = {
  "Room A": { x: 20, y: 30 },
  "Room B": { x: 50, y: 70 },
  "Room C": { x: 80, y: 30 },
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
