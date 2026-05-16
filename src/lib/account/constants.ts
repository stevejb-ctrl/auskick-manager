// Length of the soft-delete grace period (in days).
//
// When the user requests account deletion from /account, we set
// `profiles.deletion_scheduled_for = now() + GRACE_DAYS`. The nightly
// purge job (supabase/functions/purge-deleted-accounts) finds rows
// where that timestamp has passed and runs the hard delete.
//
// 30 days is the industry standard (Apple, Google, GitHub) for "you
// can change your mind" without being on the hook for compliance
// retention. Apple guideline 5.1.1(v) doesn't mandate any specific
// window — just "a reasonable time" — so this is the longer end of
// what's reasonable, in the user's favour.
export const GRACE_DAYS = 30;

// The literal the user must type into the modal to enable the
// destructive button. Lower-cased + trimmed before comparison.
export const DELETE_CONFIRMATION_WORD = "delete";
