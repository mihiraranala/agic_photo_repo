# Conference Photo Dashboard

A single page with three parts:

- **Floor plan heatmap** (top left) — the venue floor plan with a live
  heatmap showing which rooms are getting the most photo submissions.
- **Gallery slider** (bottom left) — a scrollable strip of the latest
  uploaded photos; click one to view it full-size.
- **Upload form** (collapsible right sidebar) — pick a photo, tag the
  room, add a description and name, and upload. No login screen.

Photos are stored in Firebase and the dashboard updates live as people
upload.

## 1. Create the Firebase project

1. Go to https://console.firebase.google.com and create a new project
   (free "Spark" plan is enough for a single event).
2. In the project, go to **Build > Authentication > Sign-in method** and
   enable **Anonymous**. This lets attendees upload without creating an
   account while still keeping the write rules non-public.
3. Go to **Build > Firestore Database**, click **Create database**, and
   start in production mode (any region is fine).
4. Go to **Build > Storage** and click **Get started** (also production
   mode).
5. Go to **Project settings > General**, scroll to **Your apps**, click
   the **</>** (web) icon, register an app (no hosting needed), and copy
   the `firebaseConfig` object it gives you.

## 2. Configure this app

Open `config.js` and:

- Paste your `firebaseConfig` values into `FIREBASE_CONFIG`.
- Edit the `ROOMS` array to match your venue. It currently lists every
  labeled space on `floorplan.jpeg` (meeting rooms and amenities alike).
- `FLOOR_PLAN_IMAGE` points at `floorplan.jpeg` in the repo root. Swap
  in a different image any time by replacing that file (or changing the
  filename in `config.js`).
- `ROOM_POSITIONS` maps each room name to where it sits on the floor
  plan image, as a percentage of the image's width/height (`x: 0` = left
  edge, `x: 100` = right edge, same for `y` top/bottom). This is what
  the heatmap uses to place each room's hot spot. The current values are
  eyeballed estimates — open the dashboard, see where each dot lands
  relative to its room label, and nudge the numbers until they line up.

## 3. Deploy the security rules

The rules require an anonymous-auth session and cap uploads at 15MB,
image files only, one folder per uploader. Deploy them with the
[Firebase CLI](https://firebase.google.com/docs/cli):

```bash
npm install -g firebase-tools
firebase login
firebase init firestore storage   # point at this directory, keep existing rules files
firebase deploy --only firestore:rules,storage:rules
```

(Or paste the contents of `firestore.rules` / `storage.rules` directly
into the console's Rules tab for each product.)

## 4. Host it

This is a static site (`index.html`, `style.css`, `app.js`, `config.js`,
`floorplan.jpeg`) — serve it however you like. Simplest options:

- **GitHub Pages**: push this repo, enable Pages on `main` in repo
  settings, done.
- **Firebase Hosting**: `firebase init hosting`, then
  `firebase deploy --only hosting`.

## 5. Generate the QR code

Point any QR code generator at the page's public URL (e.g.
`https://<you>.github.io/agic_photo_repo/`). Print/display it at the
conference.

## Where uploads go

- Images: Firebase Storage, under `photos/<anonymous-uid>/<timestamp>.<ext>`.
- Metadata: Firestore collection `photos`, one document per upload with
  `room`, `description`, `contributor`, `imageUrl`, `storagePath`,
  `uploadedBy`, `createdAt`.

To pull everything out later for sharing, export the `photos` collection
from the Firestore console (or write a short script with the Admin SDK)
and download the images from Storage.
