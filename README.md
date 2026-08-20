# Conference Photo Dashboard

A live photo-sharing dashboard for conferences and events. Attendees
upload photos from their phones, tagging which room or session they
were taken in, and everyone can watch the gallery and a venue heatmap
update in real time.

The page has three parts:

- **Floor plan heatmap** — the venue floor plan with a live heatmap
  showing which rooms are getting the most photo submissions.
- **Gallery slider** — a scrollable strip of the latest uploaded
  photos; click one to view it full-size.
- **Upload form** — pick a photo, tag the room, add a description and
  name, and upload. No account or login required to view or upload.

Built as a static site with a [Supabase](https://supabase.com) backend
(Postgres + Storage) for data and realtime updates.
