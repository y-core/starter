/** @jsxImportSource @y-core/forge */

import { CoreIcon } from "@assets";
import { Form } from "@y-core/forge/ui";
import type { RenderContext } from "../app/context";
import type { SiteContent } from "../model/home.content";

interface HomePageProps {
  ctx: RenderContext;
  content: SiteContent;
}

const INPUT_CLASSES =
  "mt-2 w-full rounded-xl border border-brand-200 bg-white px-4 py-3 text-base text-brand-900 outline-none transition placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:border-brand-700 dark:bg-brand-900 dark:text-brand-100 dark:placeholder:text-brand-500 dark:focus:border-brand-400 dark:focus:ring-brand-700";

export function HomePage({ ctx, content }: HomePageProps) {
  const { csrfToken, turnstileSiteKey } = ctx;
  return (
    <main id='main-content'>
      {/* Section 1: Hero */}
      <section id='home' class='mx-auto grid max-w-7xl items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:px-10 lg:py-24'>
        <div class='space-y-8'>
          <p class='text-xl font-semibold uppercase tracking-[0.3em] text-brand-600'>Digital Product Studio</p>
          <div class='space-y-5'>
            <p class='max-w-xl font-display text-xl leading-8 text-brand-900 sm:text-2xl dark:text-brand-50'>{content.hero.headline}</p>
            <p class='max-w-lg text-base leading-relaxed text-stone-600 dark:text-brand-200'>{content.hero.subtext}</p>
          </div>
          <div class='flex flex-wrap gap-4'>
            <a
              href='#contact'
              class='rounded-full bg-brand-600 px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700'>
              {content.hero.ctaPrimaryLabel}
            </a>
            <a
              href='#contact'
              class='rounded-full border border-brand-600/30 px-8 py-3.5 text-sm font-semibold text-brand-700 transition hover:border-brand-600 hover:bg-brand-50 dark:border-brand-400/30 dark:text-brand-200 dark:hover:bg-brand-800 dark:hover:border-brand-400'>
              {content.hero.ctaSecondaryLabel}
            </a>
          </div>
        </div>

        <div class='flex justify-center lg:justify-end'>
          <CoreIcon name='send' class='w-48 h-48 text-brand-300 dark:text-brand-600' />
        </div>
      </section>

      {/* Section 2: Contact */}
      <section id='contact' class='px-6 py-20 lg:px-10'>
        <div class='mx-auto max-w-7xl'>
          <div class='grid items-start gap-12 lg:grid-cols-2'>
            <div class='space-y-8'>
              <div>
                <h2 class='font-display text-4xl text-brand-900 dark:text-brand-50'>{content.contact.heading}</h2>
                <p class='mt-4 text-lg leading-8 text-stone-600 dark:text-brand-200'>{content.contact.intro}</p>
                <p class='mt-3 text-sm text-brand-600 dark:text-brand-300'>{content.contact.trust}</p>
              </div>
              <div class='space-y-4'>
                {content.contact.contacts.map((person) => (
                  <div key={person.name} class='flex flex-col gap-2'>
                    <div class='flex items-center gap-x-3'>
                      <CoreIcon name='phone' class='h-5 w-5 shrink-0 text-brand-600 dark:text-brand-300' />
                      <span class='text-brand-900 dark:text-brand-100'>{person.phone}</span>
                    </div>
                    <div class='flex items-center gap-x-3'>
                      <CoreIcon name='mail' class='h-5 w-5 shrink-0 text-brand-600 dark:text-brand-300' />
                      <span class='text-brand-900 dark:text-brand-100'>{person.email}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div class='rounded-2xl border border-brand-200/50 bg-white p-8 shadow-sm dark:border-brand-700/50 dark:bg-brand-800'>
              <Form
                data-ref='contact-form'
                class='space-y-5'
                hx-post='/api/contact'
                hx-target='#contact-result'
                hx-swap='innerHTML'
                hx-disabled-elt="find [data-ref='contact-submit']"
                hx-indicator='#form-spinner'
                novalidate={true}
                csrfToken={csrfToken}>
                <div>
                  <label class='text-sm font-medium text-brand-900 dark:text-brand-100' for='name'>
                    Name{" "}
                    <span class='text-brand-600 dark:text-brand-300' aria-hidden='true'>
                      *
                    </span>
                  </label>
                  <input class={INPUT_CLASSES} id='name' name='name' type='text' autocomplete='name' placeholder='Jane Example' required={true} />
                </div>
                <div>
                  <label class='text-sm font-medium text-brand-900 dark:text-brand-100' for='email'>
                    Email{" "}
                    <span class='text-brand-600 dark:text-brand-300' aria-hidden='true'>
                      *
                    </span>
                  </label>
                  <input
                    data-ref='turnstile-trigger'
                    class={INPUT_CLASSES}
                    id='email'
                    name='email'
                    type='email'
                    autocomplete='email'
                    placeholder='jane@example.com'
                    required={true}
                  />
                </div>
                <div>
                  <label class='text-sm font-medium text-brand-900 dark:text-brand-100' for='phone'>
                    Contact Number <span class='text-xs font-normal text-stone-400 dark:text-brand-500'>(optional)</span>
                  </label>
                  <input class={INPUT_CLASSES} id='phone' name='phone' type='tel' autocomplete='tel' placeholder='+1 555 012 3456' />
                </div>
                <div>
                  <label class='text-sm font-medium text-brand-900 dark:text-brand-100' for='message'>
                    Message{" "}
                    <span class='text-brand-600 dark:text-brand-300' aria-hidden='true'>
                      *
                    </span>
                  </label>
                  <textarea
                    class={`min-h-36 ${INPUT_CLASSES}`}
                    id='message'
                    name='message'
                    placeholder='Tell us about your project.'
                    required={true}></textarea>
                </div>
                <div class='flex flex-col items-start gap-4'>
                  <button
                    data-ref='contact-submit'
                    class='flex items-center gap-2 rounded-full bg-brand-600 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50'
                    type='submit'>
                    Send Message
                    <span id='form-spinner' class='htmx-indicator' aria-hidden='true'>
                      <CoreIcon name='spinner' class='h-4 w-4 animate-spin' />
                    </span>
                  </button>
                  {turnstileSiteKey && <div data-ref='turnstile' class='cf-turnstile' data-sitekey={turnstileSiteKey} data-size='normal'></div>}
                </div>
              </Form>
              <div data-ref='contact-result' id='contact-result' class='mt-4' aria-live='polite'></div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
