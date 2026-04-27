
-- Create private downloads bucket for desktop builds
insert into storage.buckets (id, name, public)
values ('downloads', 'downloads', false)
on conflict (id) do nothing;

-- No public RLS policies: access is granted only via signed URLs from edge functions (service role).
