/** @jsxImportSource @y-core/forge/jsx */

import { CoreIcon } from "@assets";
import { Button, Card, Form, FormField, Honeypot, Input, Spinner, Textarea, Turnstile } from "@y-core/forge/ui/core";

import type { RenderContext } from "../app/context";
import { CONTACT_DECOY } from "../controllers/actions/contact";
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
            <p class='text-sm font-semibold tracking-eyebrow text-primary uppercase'>Digital Product Studio</p>
            <div class='space-y-5'>
              <p class='max-w-xl font-serif text-4xl leading-tight text-balance text-foreground sm:text-5xl'>{content.hero.headline}</p>
              <p class='max-w-lg text-base leading-relaxed text-pretty text-muted-foreground'>{content.hero.subtext}</p>
            </div>
            <div class='flex flex-wrap justify-center gap-4 lg:justify-start'>
              <Button asChild={true} size='lg'>
                <a href='#contact'>{content.hero.ctaPrimaryLabel}</a>
              </Button>
              <Button asChild={true} size='lg' tone='neutral' appearance='outline'>
                <a href='#contact'>{content.hero.ctaSecondaryLabel}</a>
              </Button>
            </div>
          </div>
        </section>

        {/* Section 2: Contact */}
        <section id='contact' class='px-6 py-20 lg:px-10'>
          <div class='mx-auto max-w-7xl'>
            <div class='grid items-start gap-12 lg:grid-cols-2'>
              <div class='space-y-8'>
                <div>
                  <h2 class='font-serif text-4xl text-balance text-foreground'>{content.contact.heading}</h2>
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

              <Card class='p-8'>
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
                  {/* `Form` stopped rendering a decoy at forge 0.0.80 — it did so unconditionally,
                      leaking the field into every `method="get"` form's links and Referer. It is
                      composed explicitly here, and its name is named again by the action's `honeypot:`. */}
                  <Honeypot field={CONTACT_DECOY} />
                  <FormField name='name'>
                    <FormField.Label name='name'>
                      Name{" "}
                      <span class='text-primary' aria-hidden='true'>
                        *
                      </span>
                    </FormField.Label>
                    <Input field={{ name: "name" }} type='text' autocomplete='name' placeholder='Jane Example' required={true} />
                    <FormField.Error />
                  </FormField>
                  <FormField name='email'>
                    <FormField.Label name='email'>
                      Email{" "}
                      <span class='text-primary' aria-hidden='true'>
                        *
                      </span>
                    </FormField.Label>
                    <Input field={{ name: "email" }} type='email' autocomplete='email' placeholder='jane@example.com' required={true} />
                    <FormField.Error />
                  </FormField>
                  <FormField name='phone'>
                    <FormField.Label name='phone'>
                      Contact Number <span class='text-xs font-normal text-muted-foreground'>(optional)</span>
                    </FormField.Label>
                    <Input field={{ name: "phone" }} type='tel' autocomplete='tel' placeholder='+1 555 012 3456' />
                    <FormField.Error />
                  </FormField>
                  <FormField name='message'>
                    <FormField.Label name='message'>
                      Message{" "}
                      <span class='text-primary' aria-hidden='true'>
                        *
                      </span>
                    </FormField.Label>
                    <Textarea field={{ name: "message" }} placeholder='Tell us about your project.' required={true} class='min-h-36' />
                    <FormField.Error />
                  </FormField>
                  <div class='flex flex-col items-center gap-4 lg:items-start'>
                    <Button data-ref='contact-submit' type='submit' size='lg'>
                      Send Message
                      {/* The indicator is CSS-driven by htmx, so it stays a wrapped `Spinner` rather
                          than `Button`'s `loading` prop — a server-render-time boolean. */}
                      <span id='form-spinner' class='htmx-indicator' aria-hidden='true'>
                        <Spinner icon={CoreIcon} size='sm' />
                      </span>
                    </Button>
                    {/* Deliberately omits Cloudflare's `cf-turnstile` auto-render class — `mountTurnstile()`
                        owns rendering, so the widget lifecycle is deterministic. Inside the `<form>` so the
                        token input Turnstile injects is submitted with it. */}
                    {turnstileSiteKey && <Turnstile siteKey={turnstileSiteKey} size='normal' />}
                  </div>
                </Form>
                {/* oxlint-disable-next-line forge/a11y-one-live-region -- the only other region on this page is `Spinner`'s `role="status"`, and it sits inside the `aria-hidden` indicator wrapper above, so it never reaches the accessibility tree. This is the page's one live region; the rule reads the markup statically and cannot see the hidden ancestor. */}
                <div data-ref='contact-result' id='contact-result' class='mt-4' aria-live='polite'></div>
              </Card>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
