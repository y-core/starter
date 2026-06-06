/** @jsxImportSource @y-core/forge */

import { CoreIcon } from "@assets";
import { Field, Form, Input, Textarea } from "@y-core/forge/ui";
import type { RenderContext } from "../app/context";
import type { HomeContent } from "../model/home.content";
import { routes } from "../routes";
import { Layout } from "./layout";

interface HomeViewProps {
  ctx: RenderContext;
  content: HomeContent;
}

export function HomeView({ ctx, content }: HomeViewProps) {
  const { csrfToken, turnstileSiteKey } = ctx;
  return (
    <Layout ctx={ctx}>
      <main id='main-content'>
        {/* Section 1: Hero */}
        <section id='home' class='mx-auto grid max-w-7xl items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:px-10 lg:py-24'>
          <div class='space-y-8'>
            <p class='text-sm font-semibold uppercase tracking-[0.3em] text-primary'>Digital Product Studio</p>
            <div class='space-y-5'>
              <p class='max-w-xl font-display text-4xl leading-tight text-foreground sm:text-5xl'>{content.hero.headline}</p>
              <p class='max-w-lg text-base leading-relaxed text-muted-foreground'>{content.hero.subtext}</p>
            </div>
            <div class='flex flex-wrap justify-center gap-4 lg:justify-start'>
              <a
                href='#contact'
                class='rounded-full bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90'>
                {content.hero.ctaPrimaryLabel}
              </a>
              <a
                href='#contact'
                class='rounded-full border border-input px-8 py-3.5 text-sm font-semibold text-foreground transition hover:bg-accent'>
                {content.hero.ctaSecondaryLabel}
              </a>
            </div>
          </div>
        </section>

        {/* Section 2: Contact */}
        <section id='contact' class='px-6 py-20 lg:px-10'>
          <div class='mx-auto max-w-7xl'>
            <div class='grid items-start gap-12 lg:grid-cols-2'>
              <div class='space-y-8'>
                <div>
                  <h2 class='font-display text-4xl text-foreground'>{content.contact.heading}</h2>
                  <p class='mt-4 text-lg leading-8 text-muted-foreground'>{content.contact.intro}</p>
                  <p class='mt-3 text-sm text-primary'>{content.contact.trust}</p>
                </div>
                <div class='space-y-4'>
                  {content.contact.contacts.map((person) => (
                    <div key={person.name} class='flex flex-col gap-2'>
                      <div class='flex items-center gap-x-3'>
                        <CoreIcon name='phone' class='h-5 w-5 shrink-0 text-primary' />
                        <span class='text-foreground'>{person.phone}</span>
                      </div>
                      <div class='flex min-w-0 items-center gap-x-3'>
                        <CoreIcon name='mail' class='h-5 w-5 shrink-0 text-primary' />
                        <span class='min-w-0 wrap-break-word text-foreground'>{person.email}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div class='rounded-2xl border border-border bg-card p-8 shadow-sm'>
                <Form
                  data-ref='contact-form'
                  class='space-y-5'
                  hx-post={routes.contact.href()}
                  hx-target='#contact-result'
                  hx-swap='innerHTML'
                  hx-disabled-elt="find [data-ref='contact-submit']"
                  hx-indicator='#form-spinner'
                  novalidate={true}
                  csrfToken={csrfToken}>
                  <Field name='name'>
                    <Field.Label name='name'>
                      Name{" "}
                      <span class='text-primary' aria-hidden='true'>
                        *
                      </span>
                    </Field.Label>
                    <Input field={{ name: "name" }} type='text' autocomplete='name' placeholder='Jane Example' required={true} />
                    <Field.Error />
                  </Field>
                  <Field name='email'>
                    <Field.Label name='email'>
                      Email{" "}
                      <span class='text-primary' aria-hidden='true'>
                        *
                      </span>
                    </Field.Label>
                    <Input
                      field={{ name: "email" }}
                      data-ref='turnstile-trigger'
                      type='email'
                      autocomplete='email'
                      placeholder='jane@example.com'
                      required={true}
                    />
                    <Field.Error />
                  </Field>
                  <Field name='phone'>
                    <Field.Label name='phone'>
                      Contact Number <span class='text-xs font-normal text-muted-foreground'>(optional)</span>
                    </Field.Label>
                    <Input field={{ name: "phone" }} type='tel' autocomplete='tel' placeholder='+1 555 012 3456' />
                    <Field.Error />
                  </Field>
                  <Field name='message'>
                    <Field.Label name='message'>
                      Message{" "}
                      <span class='text-primary' aria-hidden='true'>
                        *
                      </span>
                    </Field.Label>
                    <Textarea field={{ name: "message" }} placeholder='Tell us about your project.' required={true} class='min-h-36' />
                    <Field.Error />
                  </Field>
                  <div class='flex flex-col items-center gap-4 lg:items-start'>
                    <button
                      data-ref='contact-submit'
                      class='flex items-center gap-2 rounded-full bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50'
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
    </Layout>
  );
}
