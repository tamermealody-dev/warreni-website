-- Allemni: profile avatar storage + safe review constraints.

-- Public avatar bucket. Files are stored as <user_id>/<filename>.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- Anyone can view public avatars.
drop policy if exists "public can view avatars" on storage.objects;
create policy "public can view avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Users can upload only inside their own folder.
drop policy if exists "users can upload own avatar" on storage.objects;
create policy "users can upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can replace/delete only their own avatar files.
drop policy if exists "users can update own avatar" on storage.objects;
create policy "users can update own avatar"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users can delete own avatar" on storage.objects;
create policy "users can delete own avatar"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Keep the profile avatar URL writable only by its owner through the existing
-- profiles RLS policy; update_my_profile handles name/city/bio.
