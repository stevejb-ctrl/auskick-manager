You're testing a specific feature: the "Fix scores" panel that lets a
coach correct goals/behinds at quarter breaks and at full time. You're
starting on a live game that's just hit the Q1 hooter. The
QuarterEndModal should be visible asking you to set the team for Q2.

Your goal: drive a realistic "I made a scoring mistake" recovery flow.

1. Confirm Q1 is over and continue to the Q2 lineup screen.
2. On the QuarterBreak screen, find the "Q1 score" recap. Note the
   numbers shown.
3. Open the Fix-scores panel. Verify it lists the goals/behinds from
   Q1.
4. Delete one of your team's goals and assert the recap updates.
5. Use "+ Add a missed score" to add an opponent goal that the coach
   forgot to record. Pick Q1 as the intended quarter.
6. Confirm the running total updates correctly.
7. Resume into Q2.
8. (Bonus) Skip ahead to the FullTimeReview at Q4 if you can —
   confirm the same Fix-scores panel works there too, and that
   tapping "Finalise game" produces the shareable summary card.

Report observations on:

- Was the "Fix scores" entry point obvious enough?
- Did the per-quarter recap make it easy to spot the wrong score?
- Any edge cases that broke (e.g. trying to delete a score that was
  already deleted)?
- Did the running total feel "live" or did it lag the deletion?
- Did the language make sense ("Add a missed score", "Finalise
  game")? Better wording suggestions?

End with a "must fix" / "nice to have" list.
