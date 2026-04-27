import type { Metadata } from "next";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { ContactForm } from "@/components/marketing/ContactForm";

export const metadata: Metadata = {
  title: "Contact — Siren Footy",
  description:
    "Get in touch with the Siren Footy team. Questions, feedback, bug reports, or feature requests welcome.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <>
      <MarketingHeader />
      <main className="mx-auto max-w-xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Get in touch
          </h1>
          <p className="mt-3 text-base text-ink-dim">
            Questions, feedback, or a bug to report? Drop us a line and we&rsquo;ll
            get back to you.
          </p>
        </div>

        <div className="mt-10">
          <ContactForm />
        </div>
      </main>
      <MarketingFooter />
    </>
  );
}
