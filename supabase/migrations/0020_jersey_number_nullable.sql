-- Make jersey_number optional on the players table.
-- Players without a jersey number are fully supported; uniqueness is enforced
-- only when a value is present (PostgreSQL UNIQUE treats NULLs as distinct).

alter table public.players
  alter column jersey_number drop not null;

-- Relax the check constraint to permit NULL.
alter table public.players
  drop constraint if exists players_jersey_number_check;

alter table public.players
  add constraint players_jersey_number_check
    check (jersey_number is null or (jersey_number >= 1 and jersey_number <= 99));
