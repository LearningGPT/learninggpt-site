-- LearningGPT server-side lesson progress. Safe to run more than once.
-- Powers real per-seat engagement in the /team dashboard and cross-device
-- progress on the account page.

create table if not exists public.lesson_completions (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  email text,
  track text not null,
  lesson text not null,
  completed_at timestamptz not null default now(),
  unique (user_id, track, lesson)
);
create index if not exists lesson_completions_user_idx on public.lesson_completions (user_id);
alter table public.lesson_completions enable row level security;
