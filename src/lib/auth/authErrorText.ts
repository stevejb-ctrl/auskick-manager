// What a sign-in or sign-up screen says when Supabase auth refuses.
//
// Auth's own refusals carry a readable message ("Invalid login
// credentials"), and those are kept. But when a gateway answers instead
// (a 504 with an empty or JSON-ish body), supabase-js puts the raw body
// in `message`, and the screen said "{}" (round 12, Nov 2026).

export interface AuthErrorLike {
  message?: string | null;
  status?: number | null;
}

const COULD_NOT_SEND = "We couldn't send the link just now. Check your connection and try again in a minute.";
const TOO_MANY = "That's a lot of tries in a short time. Wait a minute, then try again.";
const COULD_NOT_SIGN_IN = "We couldn't sign you in just now. Check your connection and try again in a minute.";

const COULD_NOT_SAVE = "We couldn't save your new password just now. Check your connection and try again in a minute.";

const FALLBACK = { send: COULD_NOT_SEND, "sign-in": COULD_NOT_SIGN_IN, "new-password": COULD_NOT_SAVE } as const;

export function authErrorText(error: AuthErrorLike, action: keyof typeof FALLBACK): string {
  const message = (error.message ?? "").trim();
  const status = error.status ?? 0;
  if (status === 429 || /rate limit|too many/i.test(message)) return TOO_MANY;
  const readable = /[a-z]{3,}/i.test(message) && !/^[[{]/.test(message);
  if (status >= 500 || !readable) return FALLBACK[action];
  return message;
}
