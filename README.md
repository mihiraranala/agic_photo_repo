# Conference Photo Upload

A single mobile page attendees reach by scanning a QR code: pick a photo,
tag the room, add a description and their name, and upload. No login
screen, no public gallery yet — photos land in Firebase for you to pull
later.

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
- Edit the `ROOMS` array to match your venue (e.g. `["Room A", "Room B",
  "Room C"]`).

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

This is a static site (`index.html`, `style.css`, `app.js`, `config.js`)
— serve it however you like. Simplest options:

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
