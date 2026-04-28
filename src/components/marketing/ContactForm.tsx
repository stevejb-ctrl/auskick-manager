"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { sendContactMessage } from "@/app/contact/actions";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  // Honeypot — hidden from real users, bots fill it, server drops the send.
  const [website, setWebsite] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await sendContactMessage({
      name,
      email,
      subject,
      message,
      website,
    });

    setLoading(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    setSent(true);
    setName("");
    setEmail("");
    setSubject("");
    setMessage("");
  }

  if (sent) {
    return (
      <div
        role="status"
        className="rounded-lg border border-hairline bg-surface p-6 text-center shadow-card"
      >
        <h3 className="text-lg font-semibold text-ink">Thanks, message sent.</h3>
        <p className="mt-2 text-sm text-ink-dim">
          We&rsquo;ll reply to the email you gave us as soon as we can.
        </p>
        <Button
          variant="secondary"
          className="mt-4"
          onClick={() => setSent(false)}
        >
          Send another
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="contact-name">Your name</Label>
        <Input
          id="contact-name"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Smith"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="contact-email">Email</Label>
        <Input
          id="contact-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="contact-subject">Subject (optional)</Label>
        <Input
          id="contact-subject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="What's on your mind?"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="contact-message">Message</Label>
        <textarea
          id="contact-message"
          required
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us what's up: a bug, a feature request, a question about your team."
          className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink shadow-card placeholder:text-ink-mute focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        />
      </div>

      {/* Honeypot — visually hidden but still in the DOM for bots.
          aria-hidden + tabIndex=-1 keep it out of screen readers and
          keyboard focus. autoComplete="off" prevents form managers
          from filling it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden opacity-0"
      >
        <label htmlFor="contact-website">
          Website (leave this empty)
          <input
            id="contact-website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
      </div>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" loading={loading} className="w-full">
        Send message
      </Button>

      <p className="text-center text-xs text-ink-mute">
        We&rsquo;ll only use your email to reply to this message.
      </p>
    </form>
  );
}
