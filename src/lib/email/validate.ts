// Shared email validation: one check for every place a person types an
// email (sign-up, sign-in, forgot password, invites, the contact form,
// feedback) and the server actions behind them, so the form and the
// server agree on what counts as an address.
//
// Closer to "did they typo?" than strict RFC 5322: real deliverability
// is the inbox's call. The browser's type="email" lets a domain with no
// dot through ("coach@gmail"), and Stagehand round 11 saw
// "new.coach@examplecom" accepted with "a link was sent". So the domain
// needs a dot and an ending of two letters or more, and nothing has
// spaces in it.

const LOCAL_RE = /^[^\s@"(),:;<>[\\\]]+$/;
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
// Two letters or more, or an IDN's punycode ending (xn--…).
const TLD_RE = /^(?:[a-z]{2,}|xn--[a-z0-9-]+)$/i;

const MAX_LENGTH = 254;

export const EMAIL_EXAMPLE = "name@example.com";

/**
 * Why `value` isn't an email address, in words a person can act on, or
 * null when it is one. Leading and trailing spaces are ignored (the
 * callers trim before saving).
 */
export function emailError(value: string | null | undefined): string | null {
  const email = (value ?? "").trim();
  if (!email) return "Enter an email address.";
  if (/\s/.test(email)) return "An email address can't have spaces in it.";
  const at = email.indexOf("@");
  if (at === -1 || at !== email.lastIndexOf("@")) {
    return `An email address has one @ in it, like ${EMAIL_EXAMPLE}.`;
  }
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local) return `Check the email address: it needs a name before the @, like ${EMAIL_EXAMPLE}.`;
  if (!domain) return "Check the email address: it needs a domain after the @, like gmail.com.";
  if (!domain.includes(".")) {
    return "Check the email address: the part after the @ needs a dot, like gmail.com.";
  }
  const labels = domain.split(".");
  const tld = labels[labels.length - 1];
  const localOk =
    LOCAL_RE.test(local) && !local.startsWith(".") && !local.endsWith(".") && !local.includes("..");
  const domainOk = labels.every((l) => LABEL_RE.test(l)) && TLD_RE.test(tld);
  if (!localOk || !domainOk || email.length > MAX_LENGTH) {
    return `That doesn't look like an email address. Check it reads like ${EMAIL_EXAMPLE}.`;
  }
  return null;
}

/** Whether `value` is a well-formed email address (see emailError). */
export function isEmail(value: string | null | undefined): value is string {
  return typeof value === "string" && emailError(value) === null;
}

/**
 * Mask an email for log lines so a stray Resend error doesn't dump a
 * recipient's address into shared logs. `alice@example.com` becomes
 * `a***@example.com`.
 */
export function maskEmail(value: string): string {
  const at = value.indexOf("@");
  if (at <= 1) return "***" + value.slice(at);
  return value[0] + "***" + value.slice(at);
}
