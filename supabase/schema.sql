-- Run this once in your Supabase project's SQL Editor
-- (Dashboard > SQL Editor > New query > paste this whole file > Run).
--
-- Sets up the `photos` table, its Row Level Security policies, and the
-- Storage bucket the app uploads photos into. See README.md for the
-- full setup walkthrough (enabling anonymous sign-ins, etc).

-- ---------- Table ----------

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  room text not null,
  description text not null default '',
  contributor text not null default 'Anonymous',
  image_url text not null,
  storage_path text not null,
  uploaded_by uuid not null,
  created_at timestamptz not null default now()
);

alter table public.photos enable row level security;

-- Anyone (including unauthenticated visitors) can read the gallery.
create policy "Anyone can read photos"
  on public.photos for select
  using (true);

-- Only signed-in users (anonymous sign-in counts) can add a photo, and
-- only tagged as themselves — mirrors the old Firestore rule.
create policy "Signed-in users can insert their own photos"
  on public.photos for insert
  to authenticated
  with check (auth.uid() = uploaded_by);

-- No update/delete policies are defined, so both are denied by default
-- once RLS is enabled (matches the old "allow update, delete: if false").

-- Required so the app's realtime subscription receives INSERT events.
alter publication supabase_realtime add table public.photos;

-- ---------- Storage bucket ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Anyone can view/download uploaded photos.
create policy "Public read access to photos bucket"
  on storage.objects for select
  using (bucket_id = 'photos');

-- Signed-in users can only upload into a folder named after their own
-- user id (path is "<uid>/<timestamp>.jpg"), same layout as before.
create policy "Signed-in users can upload to their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
