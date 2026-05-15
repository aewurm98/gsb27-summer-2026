-- Phase 0: Fix photo upload
-- The avatars bucket exists and is public, but storage.objects had no RLS policies.
-- Supabase storage requires explicit RLS even for public buckets.

-- Allow authenticated users to upload their own avatar
-- Files must be uploaded under a path prefixed with their user UUID
create policy "Users can upload their own avatar"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to replace/update their own avatar
create policy "Users can update their own avatar"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow anyone (including unauthenticated visitors) to read avatars
create policy "Anyone can view avatars"
on storage.objects for select
to public
using (bucket_id = 'avatars');
