-- Coach-labeled cohort chips for the squad.
--
-- Each player gets up to one chip ('a', 'b', or 'c'). The team
-- supplies optional human labels for each chip — coach decides
-- what each chip means: "older / younger", "left foot / right
-- foot", whatever. The lineup suggester reads the chip key and
-- spreads chips evenly across zones via a soft penalty so the
-- coach doesn't have to manually mix.
--
-- All columns nullable. Existing teams + players keep working
-- unchanged; chips are purely additive.

alter table public.players
  add column chip text
    check (chip is null or chip in ('a', 'b', 'c'));

alter table public.teams
  add column chip_a_label text,
  add column chip_b_label text,
  add column chip_c_label text;
