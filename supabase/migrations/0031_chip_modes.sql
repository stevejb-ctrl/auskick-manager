-- Per-chip behaviour: split (spread across zones) or group (keep
-- together). The default is 'split' to preserve Phase D's launched
-- behaviour — coaches who didn't pick a mode wanted "mix older with
-- younger" semantics.
--
-- Group mode flips the chip-spread penalty into a chip-cluster bonus:
-- placing a group-chip player into a zone that already has the same
-- chip becomes the cheapest option, so chip-mates funnel into one
-- zone (subject to zone caps). Use case Steve raised: a player with
-- social needs who should stay paired with specific teammates.

alter table public.teams
  add column chip_a_mode text not null default 'split'
    check (chip_a_mode in ('split', 'group')),
  add column chip_b_mode text not null default 'split'
    check (chip_b_mode in ('split', 'group')),
  add column chip_c_mode text not null default 'split'
    check (chip_c_mode in ('split', 'group'));
