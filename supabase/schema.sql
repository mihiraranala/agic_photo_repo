-- Safe to run more than once (every step below is idempotent). Run it
-- in your Supabase project's SQL Editor
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
drop policy if exists "Anyone can read photos" on public.photos;
create policy "Anyone can read photos"
  on public.photos for select
  using (true);

-- Direct inserts into photos are not allowed for anyone — the only way
-- to create a row is through submit_photo() below, which checks the
-- conference access code, the uid, and the rate limit itself. (Its
-- SECURITY DEFINER insert bypasses this table's RLS, so leaving an
-- insert policy here would be a silent bypass of the code check.)
drop policy if exists "Signed-in users can insert their own photos" on public.photos;

-- No insert/update/delete policies are defined, so all three are denied
-- by default once RLS is enabled — writes only ever happen inside
-- submit_photo().

-- Required so the app's realtime subscription receives INSERT events.
do $$
begin
  alter publication supabase_realtime add table public.photos;
exception
  when duplicate_object then null;
end $$;

-- ---------- Conference access code ----------
-- Gates who can upload (you have to know the code word announced at the
-- event). Gallery/heatmap reads above are untouched and stay fully public
-- — only submit_photo() below checks this.

create table if not exists public.event_config (
  id boolean primary key default true,
  access_code text not null,
  constraint event_config_singleton check (id) -- guarantees exactly one row can ever exist
);

-- Not readable via the REST API by anyone — only a SECURITY DEFINER
-- function (running as the owning role) can see this.
revoke all on public.event_config from anon, authenticated;

-- CHANGE THIS before the event: update public.event_config set access_code = 'YOUR_CODE' where id = true;
insert into public.event_config (id, access_code)
values (true, 'REPLACE_ME_BEFORE_THE_EVENT')
on conflict (id) do nothing;

-- The only way a photo row gets created. Checks the access code, the
-- caller's uid, and the rate limit itself (all three, since its own
-- insert bypasses this table's normal RLS as a SECURITY DEFINER
-- function). search_path is pinned to prevent search-path hijacking,
-- a standard hardening step for SECURITY DEFINER functions.
create or replace function public.submit_photo(
  p_room text,
  p_description text,
  p_contributor text,
  p_image_url text,
  p_storage_path text,
  p_access_code text
)
returns public.photos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_uid uuid := auth.uid();
  v_recent_count int;
  v_row public.photos;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select access_code into v_code from public.event_config where id = true;

  -- is distinct from is null-safe: a bare <> would silently let a
  -- missing/empty code through if either side were null.
  if v_code is null
     or p_access_code is null
     or lower(trim(p_access_code)) is distinct from lower(trim(v_code)) then
    raise exception 'Incorrect conference code' using errcode = 'EV001';
  end if;

  select count(*) into v_recent_count
    from public.photos
    where uploaded_by = v_uid
      and created_at > now() - interval '10 minutes';

  if v_recent_count >= 10 then
    raise exception 'Too many uploads, please slow down' using errcode = 'EV002';
  end if;

  insert into public.photos (room, description, contributor, image_url, storage_path, uploaded_by)
  values (
    p_room,
    coalesce(p_description, ''),
    coalesce(nullif(trim(p_contributor), ''), 'Anonymous'),
    p_image_url,
    p_storage_path,
    v_uid
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.submit_photo(text, text, text, text, text, text) from public;
grant execute on function public.submit_photo(text, text, text, text, text, text) to authenticated;

-- ---------- Admin delete access ----------
-- Admins are regular Supabase Auth users (real email+password, NOT
-- anonymous sign-in) whose app_metadata carries {"is_admin": true}.
-- app_metadata (unlike user_metadata) can only be set by an admin/
-- service-role via SQL or the Auth API — never by the user themselves —
-- so it's safe to trust inside RLS, unlike a client-supplied value.
--
-- To make someone an admin:
--   1. Dashboard > Authentication > Users > Add user (email + password).
--   2. Run in the SQL Editor:
--        update auth.users
--        set raw_app_meta_data = raw_app_meta_data || '{"is_admin": true}'::jsonb
--        where email = 'their-email@example.com';
--   3. If they were already logged in when you ran that, they need to
--      log out and back in — the claim is baked into the JWT at sign-in
--      time and won't update on an existing session.

drop policy if exists "Admins can delete photos" on public.photos;
create policy "Admins can delete photos"
  on public.photos for delete
  to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false));

drop policy if exists "Admins can delete photo files" on storage.objects;
create policy "Admins can delete photo files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'photos'
    and coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false)
  );

-- ---------- Storage bucket ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Anyone can view/download uploaded photos.
drop policy if exists "Public read access to photos bucket" on storage.objects;
create policy "Public read access to photos bucket"
  on storage.objects for select
  using (bucket_id = 'photos');

-- Signed-in users can only upload into a folder named after their own
-- user id (path is "<uid>/<timestamp>.jpg"), same layout as before, and
-- same 10-per-10-minutes cap as the photos table above (someone could
-- otherwise spam Storage directly without ever inserting a photos row).
drop policy if exists "Signed-in users can upload to their own folder" on storage.objects;
create policy "Signed-in users can upload to their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (
      select count(*) from storage.objects o
      where o.bucket_id = 'photos'
        and (storage.foldername(o.name))[1] = auth.uid()::text
        and o.created_at > now() - interval '10 minutes'
    ) < 10
  );
