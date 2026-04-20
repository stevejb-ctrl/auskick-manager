-- Add team song columns
alter table public.teams
  add column song_url text,
  add column song_start_seconds integer not null default 0;

-- Public bucket for team songs (unauthenticated playback from the live game page)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'team-songs',
  'team-songs',
  true,
  20971520, -- 20 MB
  array[
    'audio/mpeg',     -- .mp3
    'audio/mp4',      -- .m4a
    'audio/x-m4a',
    'audio/aac',      -- .aac
    'audio/wav',      -- .wav
    'audio/x-wav',
    'audio/ogg',      -- .ogg
    'audio/webm'      -- .webm audio
  ]
)
on conflict (id) do nothing;

-- Anyone can read files (required for unauthenticated audio playback via public URL)
create policy "Public read team songs"
  on storage.objects for select
  using (bucket_id = 'team-songs');
