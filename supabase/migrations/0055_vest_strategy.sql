-- ============================================================
-- Rugby league vest strategy (UX plan 5.6): how the FR / DH vests are
-- chosen each half — always within the vest rules.
--
--   auto         the fairness pick (today's behaviour; the default)
--   fixed-order  round the squad in jersey order from the last wearer
--   coach        no suggestion; the coach picks each half
-- ============================================================

alter table public.team_playbooks
  add column if not exists vest_strategy text not null default 'auto'
    check (vest_strategy in ('auto', 'fixed-order', 'coach'));
