/** @jsxImportSource @y-core/forge */
import { Form, Icon } from "@y-core/forge/ui";
import type { SiteContent } from "../model/home.content";

interface HomePageProps {
  content: SiteContent;
  csrfToken?: string;
  turnstileSiteKey?: string;
}

const INPUT_CLASSES = "mt-2 w-full rounded-xl border border-brand-200 bg-white px-4 py-3 text-base text-brand-900 outline-none transition placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:border-brand-700 dark:bg-brand-900 dark:text-brand-100 dark:placeholder:text-brand-500 dark:focus:border-brand-400 dark:focus:ring-brand-700";

export function HomePage({ content, csrfToken, turnstileSiteKey }: HomePageProps) {
  return (
    <main id="main-content">

      {/* Section 1: Hero */}
      <section id="home" class="mx-auto grid max-w-7xl items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:px-10 lg:py-24">
        <div class="space-y-8">
          <p class="text-xl font-semibold uppercase tracking-[0.3em] text-brand-600">Digital Product Studio</p>
          <div class="space-y-5">
            <p class="max-w-xl font-display text-xl leading-8 text-brand-900 sm:text-2xl dark:text-brand-50">{content.hero.headline}</p>
            <p class="max-w-lg text-base text-right leading-relaxed text-stone-600 dark:text-brand-200">{content.hero.subtext}</p>
          </div>
          <div class="flex flex-wrap gap-4">
            <a href="#contact" class="rounded-full bg-brand-600 px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700">{content.hero.ctaPrimaryLabel}</a>
            <a href="#process" class="rounded-full border border-brand-600/30 px-8 py-3.5 text-sm font-semibold text-brand-700 transition hover:border-brand-600 hover:bg-brand-50 dark:border-brand-400/30 dark:text-brand-200 dark:hover:bg-brand-800 dark:hover:border-brand-400">{content.hero.ctaSecondaryLabel}</a>
          </div>
        </div>

        <div class="flex justify-center lg:justify-end">
          <Icon symbol="icon-send" viewBox="0 0 24 24" class="w-48 h-48 text-brand-300 dark:text-brand-600" />
        </div>
      </section>

      {/* Section 2: Services */}
      <section id="services" class="px-6 py-10 lg:px-10">
        <div class="mx-auto max-w-7xl">
          <div class="mb-14 space-y-4 text-center">
            <h2 class="font-display text-4xl text-brand-900 dark:text-brand-50">{content.about.heading}</h2>
          </div>

          <div class="flex flex-col items-center gap-y-12 md:items-start">
            {content.about.services.map((service, i) => (
              <div key={service.title} class={`border-r-2 border-b-2 rounded-4xl relative w-[480px] ${["", "md:self-center", "md:self-end"][i]}`}>
                <div class="flex flex-col items-center justify-between text-center m-6 gap-y-4">
                  <div class="flex flex-col items-center gap-1">
                    <Icon symbol={service.icon} width={64} height={64} viewBox="0 0 24 24" class="text-brand-600 dark:text-brand-300" />
                    <h3 class="font-display pt-4 text-2xl leading-tight text-brand-900 dark:text-brand-50">{service.title}</h3>
                  </div>
                  <p class="text-justify text-base leading-relaxed text-stone-600 dark:text-brand-200 max-w-sm">{service.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 3: Process — alternating vertical timeline */}
      <section id="process" class="px-6 py-20 lg:px-10">
        <div class="mx-auto max-w-7xl">
          <div class="mb-14 space-y-4 text-center">
            <h2 class="font-display text-4xl text-brand-900 dark:text-brand-50">{content.process.heading}</h2>
            <p class="mx-auto max-w-2xl text-lg leading-8 text-stone-600 dark:text-brand-200">{content.process.intro}</p>
          </div>
          <div class="relative mx-auto max-w-3xl">
            {/* Vertical center line (md+) */}
            <div class="absolute bottom-0 left-1/2 top-0 hidden w-0.5 -translate-x-1/2 bg-brand-200 md:block dark:bg-brand-700" aria-hidden="true" />

            {content.process.steps.map((step, i) => (
              <div key={step.number} class="py-8">

                {/* Mobile: circle left, text right */}
                <div class="flex items-center gap-4 md:hidden">
                  <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-600 font-display text-lg font-bold text-white shadow-sm">
                    {step.number}
                  </div>
                  <div>
                    <h3 class="font-display text-xl text-brand-900 dark:text-brand-50">{step.title}</h3>
                    <p class="mt-2 text-sm leading-6 text-stone-600 dark:text-brand-200">{step.body}</p>
                  </div>
                </div>

                {/* Desktop: alternating left/right */}
                <div class={`gap-x-4 hidden items-center md:flex ${i % 2 !== 0 ? "flex-row-reverse" : ""}`}>
                  <div class={`flex-1 px-8 ${i % 2 === 0 ? "text-right" : "text-left"}`}>
                    <h3 class="font-display text-xl text-brand-900 dark:text-brand-50">{step.title}</h3>
                    <p class="mt-2 text-sm leading-6 text-stone-600 dark:text-brand-200">{step.body}</p>
                  </div>
                  <div class="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-600 font-display text-xl font-bold text-white shadow-sm">
                    {step.number}
                  </div>
                  <div class="flex-1" />
                </div>

              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 4: Why Choose Us */}
      <section id="why-us" class="bg-brand-50 px-6 py-20 lg:px-10 dark:bg-brand-900/50">
        <div class="mx-auto max-w-7xl">
          <div class="mb-14 space-y-4 text-center">
            <h2 class="font-display text-4xl text-brand-900 dark:text-brand-50">{content.whychoose.heading}</h2>
            <p class="mx-auto max-w-2xl text-lg leading-8 text-stone-600 dark:text-brand-200">{content.whychoose.intro}</p>
          </div>
          <div class="grid gap-12 lg:grid-cols-5">

            {/* Hero stat */}
            <div class="flex flex-col justify-center space-y-4 lg:col-span-2">
              <p class="font-display text-6xl font-bold text-brand-600 md:text-7xl lg:text-8xl">{content.whychoose.highlight.number}</p>
              <p class="font-display text-xl text-brand-900 dark:text-brand-50">{content.whychoose.highlight.label}</p>
              <p class="leading-7 text-stone-600 dark:text-brand-200">{content.whychoose.highlight.body}</p>
            </div>

            {/* Commitment rows */}
            <div class="flex flex-col justify-center divide-y divide-brand-200/70 lg:col-span-3 dark:divide-brand-700/70">
              {content.whychoose.commitments.map((commitment) => (
                <div key={commitment.title} class="flex items-start gap-5 py-6 first:pt-0 last:pb-0">
                  <Icon symbol={commitment.icon} width={48} height={48} viewBox="0 0 24 24" class="shrink-0 text-brand-600 dark:text-brand-300" />
                  <div>
                    <h3 class="font-display text-xl text-brand-900 dark:text-brand-50">{commitment.title}</h3>
                    <p class="mt-1 leading-7 text-stone-600 dark:text-brand-200">{commitment.body}</p>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      </section>

      {/* Section 5: Closing CTA */}
      <section class="bg-brand-800 px-6 py-20 text-center text-white lg:px-10">
        <div class="mx-auto max-w-3xl space-y-6">
          <h2 class="font-display text-4xl text-white sm:text-5xl">{content.closing.headline}</h2>
          <p class="text-lg leading-8 text-brand-200">{content.closing.body}</p>
          <a href="#contact" class="inline-block rounded-full border-2 border-white px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-white hover:text-brand-800">{content.closing.ctaLabel}</a>
        </div>
      </section>

      {/* Section 6: Contact */}
      <section id="contact" class="px-6 py-20 lg:px-10">
        <div class="mx-auto max-w-7xl">
          <div class="grid items-start gap-12 lg:grid-cols-2">

            <div class="space-y-8">
              <div>
                <h2 class="font-display text-4xl text-brand-900 dark:text-brand-50">{content.contact.heading}</h2>
                <p class="mt-4 text-lg leading-8 text-stone-600 dark:text-brand-200">{content.contact.intro}</p>
                <p class="mt-3 text-sm text-brand-600 dark:text-brand-300">{content.contact.trust}</p>
              </div>
              <div class="space-y-4">
                {content.contact.contacts.map((person) => (
                  <div key={person.name} class="flex flex-col gap-2">
                    <div class="flex items-center gap-x-3">
                      <Icon symbol="icon-phone" viewBox="0 0 24 24" class="h-5 w-5 shrink-0 text-brand-600 dark:text-brand-300" />
                      <span class="text-brand-900 dark:text-brand-100">{person.phone}</span>
                    </div>
                    <div class="flex items-center gap-x-3">
                      <Icon symbol="icon-mail" viewBox="0 0 24 24" class="h-5 w-5 shrink-0 text-brand-600 dark:text-brand-300" />
                      <span class="text-brand-900 dark:text-brand-100">{person.email}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div class="rounded-2xl border border-brand-200/50 bg-white p-8 shadow-sm dark:border-brand-700/50 dark:bg-brand-800">
              <Form
                data-ref="contact-form"
                class="space-y-5"
                hx-post="/api/contact"
                hx-target="#contact-result"
                hx-swap="innerHTML"
                hx-disabled-elt="find [data-ref='contact-submit']"
                hx-indicator="#form-spinner"
                novalidate={true}
                csrfToken={csrfToken}
              >
                <div>
                  <label class="text-sm font-medium text-brand-900 dark:text-brand-100" for="name">Name <span class="text-brand-600 dark:text-brand-300" aria-hidden="true">*</span></label>
                  <input class={INPUT_CLASSES} id="name" name="name" type="text" autocomplete="name" placeholder="Jane Example" required={true} />
                </div>
                <div>
                  <label class="text-sm font-medium text-brand-900 dark:text-brand-100" for="email">Email <span class="text-brand-600 dark:text-brand-300" aria-hidden="true">*</span></label>
                  <input data-ref="turnstile-trigger" class={INPUT_CLASSES} id="email" name="email" type="email" autocomplete="email" placeholder="jane@example.com" required={true} />
                </div>
                <div>
                  <label class="text-sm font-medium text-brand-900 dark:text-brand-100" for="phone">Contact Number <span class="text-xs font-normal text-stone-400 dark:text-brand-500">(optional)</span></label>
                  <input class={INPUT_CLASSES} id="phone" name="phone" type="tel" autocomplete="tel" placeholder="+1 555 012 3456" />
                </div>
                <div>
                  <label class="text-sm font-medium text-brand-900 dark:text-brand-100" for="message">Message <span class="text-brand-600 dark:text-brand-300" aria-hidden="true">*</span></label>
                  <textarea class={`min-h-36 ${INPUT_CLASSES}`} id="message" name="message" placeholder="Tell us about your project." required={true}></textarea>
                </div>
                <div class="flex flex-col items-start gap-4">
                  <button data-ref="contact-submit" class="flex items-center gap-2 rounded-full bg-brand-600 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50" type="submit">
                    Send Message
                    <span id="form-spinner" class="htmx-indicator" aria-hidden="true">
                      <Icon symbol="icon-spinner" viewBox="0 0 24 24" class="h-4 w-4 animate-spin" />
                    </span>
                  </button>
                  {turnstileSiteKey && (
                    <div data-ref="turnstile" class="cf-turnstile" data-sitekey={turnstileSiteKey} data-size="normal"></div>
                  )}
                </div>
              </Form>
              <div data-ref="contact-result" id="contact-result" class="mt-4" aria-live="polite"></div>
            </div>

          </div>
        </div>
      </section>

    </main>
  );
}
