# Conference Photo Dashboard

A single page with three parts:

- **Floor plan heatmap** (top left) — the venue floor plan with a live
  heatmap showing which rooms are getting the most photo submissions.
- **Gallery slider** (bottom left) — a scrollable strip of the latest
  uploaded photos; click one to view it full-size.
- **Upload form** (collapsible right sidebar) — enter the conference
  code, pick a photo, tag the room, add a description and name, and
  upload. No login screen.

Photos are stored in Supabase (Postgres + Storage) and the dashboard
updates live as people upload. Only people who know the conference
access code can upload — anyone can view the gallery/heatmap.

## 1. Create the Supabase project

1. Go to https://supabase.com, sign up/in, and create a **New project**
   (the free tier is enough for a single event). Pick a region close to
   your venue. Set a database password — generate a random one, you
   won't need to remember it day to day (see project creation options
   below).
2. On the project-creation screen: enable **Data API** (required — the
   app's JS talks to Supabase through it), **Automatically expose new
   tables** (so `photos` is queryable without an extra manual step),
   and **Automatic RLS** (secure-by-default for any table you add
   later). Choose plain **Postgres**, not "Postgres with OrioleDB" —
   OrioleDB is an experimental alpha storage engine, not something a
   small conference app needs.
3. **Authentication → Sign In / Providers** → enable **Anonymous
   Sign-Ins**. This lets attendees upload without creating an account.
   Consider also enabling CAPTCHA (hCaptcha/Turnstile) here — Supabase
   already rate-limits anonymous sign-ins to 30/hour per IP by default.
4. **SQL Editor → New query** → paste the entire contents of
   `supabase/schema.sql` → **Run**. This creates the `photos` table and
   its Row Level Security policies, the `event_config` table holding
   the conference access code, the `submit_photo()` function that
   gates uploads on that code, and the `photos` Storage bucket (public
   read, 5MB/image cap, JPEG/PNG/WebP only). The file is safe to re-run
   any time you update it.
5. **Project Settings → API** → copy the **Project URL** and the
   **`anon` `public`** key (not `service_role` — that one must never
   appear in client-side code).

## 2. Set the conference access code

Uploads are gated by a shared code word announced/printed at the
event — attendees enter it in the upload form alongside their photo.
Right after running `supabase/schema.sql`, set the real code (it seeds
as a placeholder):

```sql
update public.event_config set access_code = 'YOUR_CODE_HERE' where id = true;
```

Run that anytime in the SQL Editor. You can rotate the code the same
way, any time, with no app redeploy needed — anyone still using the
old code will just get "Incorrect conference code" on their next
upload. Viewing the gallery/heatmap is unaffected either way; only
uploading requires the code.

## 3. Configure this app

Open `config.js` and:

- Paste your Project URL and `anon` key into `SUPABASE_URL` /
  `SUPABASE_ANON_KEY`. (Safe to commit — see the comment in that file
  for why; access is controlled by the RLS policies and the
  `submit_photo()` function in `supabase/schema.sql`, not by keeping
  this key secret.)
- Edit the `ROOMS` array to match your venue's taggable spaces.
- The floor plan itself is hand-drawn inline SVG markup — the
  `<svg id="floorplan-map">` block in `index.html` (viewBox `0 0 1600
  1560`) — not generated from `config.js` and not an image file. To
  match a different venue, edit that SVG's shapes/labels directly (each
  room is a `<rect>`/`<path>` + `<text>` group; copy an existing room's
  markup as a starting point).
- `ROOM_POSITIONS` in `config.js` maps each room name to where its
  heatmap "hot spot" and photo markers sit, as a percentage of the SVG's
  1600×1560 viewBox — should land at/near the center of that room's
  shape. These are computed from the SVG's coordinates; open the
  dashboard, see how each dot lands, and nudge the numbers until they
  line up if you redraw the SVG.

## 4. Push to GitHub

```bash
git add -A
git commit -m "Your message"
git push
```

## 5. Deploy on Vercel

1. https://vercel.com → sign in with GitHub → **Add New → Project** →
   import this repo.
2. It's a plain static site (no build step) — Framework Preset:
   **Other**, leave Build Command/Output Directory at their defaults.
   **Deploy**.
3. Every push to `main` auto-redeploys from then on.

## 6. Generate the QR code

Point any QR code generator at the deployed `.vercel.app` URL (or your
custom domain). Print/display it — and the access code — at the
conference.

## 7. Set up an admin account (optional, for moderation)

The gallery panel header has a small "Admin" link — signing in there
reveals a delete (×) button on every photo (gallery thumbnails and the
full-size lightbox view), for removing anything inappropriate. To
create an admin account:

1. Dashboard → **Authentication → Users → Add user** → set an email
   and password (this is a real account, not the anonymous sign-in
   attendees use).
2. In the **SQL Editor**, run:
   ```sql
   update auth.users
   set raw_app_meta_data = raw_app_meta_data || '{"is_admin": true}'::jsonb
   where email = 'your-email@example.com';
   ```
3. On the dashboard, click **Admin**, sign in with that email/password.

Deletion is enforced in Postgres (RLS checking this claim on the
signed-in JWT — see "Admin delete access" in `supabase/schema.sql`),
not just hidden in the UI, so only actual admins can delete regardless
of how a request reaches Supabase. Deleting removes both the database
row and the image file in Storage, and disappears from every open
dashboard immediately via the realtime feed.

## Guardrails already in place

- **Conference access code** — enforced in Postgres (`submit_photo()`
  in `supabase/schema.sql`), not just in the browser, so it can't be
  bypassed by calling the Supabase API directly.
- **Rate limit** — 10 uploads per rolling 10 minutes per signed-in
  session, also enforced in Postgres.
- **Honeypot field** — a hidden form field that trips up simple bots.
- **Client-side cooldown** — 15 seconds between uploads per browser tab
  (UX friction only; the real cap is the rate limit above).
- **Image compression** — every photo is resized to a 1600px-long-edge
  JPEG in the browser before upload (see `compressImage` in `app.js`),
  keeping the gallery/heatmap fast and normal 8-12MB phone photos well
  under the 5MB Storage cap.

## Where uploads go

- Images: Supabase Storage, bucket `photos`, under `<anonymous-uid>/<timestamp>.jpg`.
- Metadata: Postgres table `public.photos`, one row per upload with
  `room`, `description`, `contributor`, `image_url`, `storage_path`,
  `uploaded_by`, `created_at` — created only via `submit_photo()`,
  never by a direct insert.

To pull everything out later for sharing, use the Supabase dashboard's
Table Editor (export `photos` as CSV) and download images from the
Storage bucket.
