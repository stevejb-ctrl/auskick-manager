import type { Metadata } from "next";
import { MarketingBanner } from "@/components/marketing/MarketingBanner";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { ContactForm } from "@/components/marketing/ContactForm";

export const metadata: Metadata = {
  title: "Contact · Siren",
  description:
    "Get in touch with the Siren team. Questions, feedback, bug reports, or feature requests welcome.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <>
      <MarketingBanner />
      <MarketingHeader />
      <main className="mx-auto max-w-xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="text-center">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-micro text-ink-dim">
            Contact
          </p>
          <h1 className="mt-3 text-3xl font-bold leading-[1.05] tracking-tightest text-ink [text-wrap:balance] sm:text-4xl md:text-5xl">
            Get in{" "}
            <em className="font-serif font-normal italic">touch</em>.
          </h1>
          <p className="mt-4 text-base text-ink-dim sm:text-lg">
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
