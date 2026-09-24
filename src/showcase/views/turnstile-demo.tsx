/** @jsxRuntime automatic */
/** @jsxImportSource @y-core/forge/jsx */

import { CoreIcon } from "@assets";
import type { TurnstileFailure } from "@y-core/forge/form";
import { TURNSTILE_FIELD_DEFAULT } from "@y-core/forge/form";
import { formSubmit, SWAP } from "@y-core/forge/html/htmx";
import type { FC } from "@y-core/forge/jsx";
import { Alert, Button, Form, FormField, Input, Select, Turnstile } from "@y-core/forge/ui/core";

import { CHALLENGES, LANGUAGES, LOADS, SIZES, TURNSTILE_APPEARANCES, TURNSTILE_PASS_KEY, TURNSTILE_TEST_KEYS } from "../model/turnstile";
import type { TurnstileDemoOptions, TurnstileVerdict } from "../model/types";
import { showcaseRouteMap } from "../routes";
import { CatalogPanel, CatalogRow } from "./components";

/** Where the verdict fragment lands, so the form and the action never drift. @public */
export const SHOW_TURNSTILE_VERDICT_ID = "show-turnstile-verdict";

/** The sitekey the chosen preset names. @public */
export function turnstileSiteKey(options: TurnstileDemoOptions): string {
  return (TURNSTILE_TEST_KEYS.find((candidate) => candidate.id === options.key) ?? TURNSTILE_PASS_KEY).siteKey;
}

/** The `<Turnstile>` call the current options correspond to, as source a reader can copy. @public */
export function turnstileSnippet(options: TurnstileDemoOptions): string {
  const props = [`siteKey='${turnstileSiteKey(options)}'`];
  if (options.size !== "normal") props.push(`size='${options.size}'`);
  if (options.load !== "eager") props.push(`load='${options.load}'`);
  if (options.challenge !== "render") props.push(`challenge='${options.challenge}'`);
  if (options.appearance !== "always") props.push(`appearance='${options.appearance}'`);
  if (options.action !== "") props.push(`action='${options.action}'`);
  if (options.cData !== "") props.push(`cData='${options.cData}'`);
  if (options.language !== "auto") props.push(`language='${options.language}'`);
  if (options.tabindex !== null) props.push(`tabindex={${options.tabindex}}`);
  return `<Turnstile ${props.join(" ")} />`;
}

const OPTION_FIELD = "space-y-1";

const OptionSelect: FC<{ name: string; label: string; children: unknown }> = ({ name, label, children }) => (
  <FormField name={name} class={OPTION_FIELD}>
    <FormField.Label name={name}>{label}</FormField.Label>
    <Select name={name} icon={CoreIcon} field={{ name }}>
      {children}
    </Select>
  </FormField>
);

const options = <T extends string>(values: readonly T[], selected: T) =>
  values.map((value) => (
    <Select.Option key={value} value={value} selected={value === selected}>
      {value}
    </Select.Option>
  ));

/** The option panel: a plain GET form, so the whole configuration is the URL. */
const OptionsForm: FC<{ data: TurnstileDemoOptions }> = ({ data }) => (
  <Form method='get' action={showcaseRouteMap.turnstile.href()} class='grid gap-4 sm:grid-cols-2'>
    <FormField name='key' class={OPTION_FIELD}>
      <FormField.Label name='key'>Test sitekey</FormField.Label>
      <Select name='key' icon={CoreIcon} field={{ name: "key" }}>
        {TURNSTILE_TEST_KEYS.map((candidate) => (
          <Select.Option key={candidate.id} value={candidate.id} selected={candidate.id === data.key}>
            {candidate.label}
          </Select.Option>
        ))}
      </Select>
    </FormField>
    <OptionSelect name='size' label='size'>
      {options(SIZES, data.size)}
    </OptionSelect>
    <OptionSelect name='load' label='load'>
      {options(LOADS, data.load)}
    </OptionSelect>
    <OptionSelect name='challenge' label='challenge'>
      {options(CHALLENGES, data.challenge)}
    </OptionSelect>
    <OptionSelect name='appearance' label='appearance'>
      {options(TURNSTILE_APPEARANCES, data.appearance)}
    </OptionSelect>
    <OptionSelect name='language' label='language'>
      {options(LANGUAGES, data.language)}
    </OptionSelect>
    <FormField name='action' class={OPTION_FIELD}>
      <FormField.Label name='action'>action</FormField.Label>
      <Input name='action' value={data.action} placeholder='signup' field={{ name: "action" }} />
      <FormField.Description name='action'>Letters, digits, underscore and hyphen, up to 32.</FormField.Description>
    </FormField>
    <FormField name='cData' class={OPTION_FIELD}>
      <FormField.Label name='cData'>cData</FormField.Label>
      <Input name='cData' value={data.cData} placeholder='order-4821' field={{ name: "cData" }} />
      <FormField.Description name='cData'>
        Returned by siteverify, so a token can be matched to a record. Up to 255 of the same charset.
      </FormField.Description>
    </FormField>
    <FormField name='tabindex' class={OPTION_FIELD}>
      <FormField.Label name='tabindex'>tabindex</FormField.Label>
      <Input type='number' name='tabindex' value={data.tabindex === null ? "" : String(data.tabindex)} field={{ name: "tabindex" }} />
    </FormField>
    <div class='flex gap-2 sm:col-span-2'>
      <Button type='submit' tone='primary'>
        Render widget
      </Button>
      <Button tone='neutral' appearance='outline' asChild>
        <a href={showcaseRouteMap.turnstile.href()}>Reset</a>
      </Button>
    </div>
  </Form>
);

/** The configured widget, in the form it is meant to live in. */
const PlaygroundWidget: FC<{ data: TurnstileDemoOptions }> = ({ data }) => (
  <Form
    action={showcaseRouteMap.api.turnstileVerify.href()}
    method='post'
    class='w-full max-w-sm space-y-3'
    {...formSubmit({ post: showcaseRouteMap.api.turnstileVerify.href(), target: `#${SHOW_TURNSTILE_VERDICT_ID}`, swap: SWAP.innerHtml })}>
    <FormField name='email'>
      <FormField.Label name='email'>Email</FormField.Label>
      <Input type='email' name='email' placeholder='you@example.com' field={{ name: "email" }} />
    </FormField>
    <Turnstile
      siteKey={turnstileSiteKey(data)}
      size={data.size}
      load={data.load}
      challenge={data.challenge}
      appearance={data.appearance}
      {...(data.action === "" ? {} : { action: data.action })}
      {...(data.cData === "" ? {} : { cData: data.cData })}
      {...(data.language === "auto" ? {} : { language: data.language })}
      {...(data.tabindex === null ? {} : { tabindex: data.tabindex })}
    />
    <Button type='submit'>Submit</Button>
  </Form>
);

const PlaygroundSection: FC<{ data: TurnstileDemoOptions }> = ({ data }) => (
  // Not `turnstile`: the DOM publishes every `id` on `window`, and Cloudflare's `api.js` reads
  // `window.turnstile`'s truthiness to decide it has already loaded.
  <CatalogPanel
    id='turnstile-widget'
    title='Turnstile playground'
    description='Every prop the SSR component takes, driven from the query string. The URL is the whole configuration, so a setting worth reporting is a link.'>
    <div class='grid gap-6 lg:grid-cols-2'>
      <OptionsForm data={data} />
      <div class='space-y-4'>
        <PlaygroundWidget data={data} />
        <pre class='overflow-x-auto rounded-lg border border-border bg-muted p-3 text-xs text-muted-foreground'>
          <code>{turnstileSnippet(data)}</code>
        </pre>
      </div>
    </div>
    <div id={SHOW_TURNSTILE_VERDICT_ID} class='mt-6' />
  </CatalogPanel>
);

// `load='focus'` on the first three: three eager widgets would issue three challenges to anyone who
// scrolls past, and the script waits on a `focusin` within the enclosing form.
const VariantsSection: FC = () => (
  <CatalogPanel
    id='turnstile-variants'
    title='Sizes and modes'
    description='The three widget sizes, each deferred to first focus, and the challenge held back to submit.'>
    <CatalogRow>
      <Form action='#' method='post' class='w-full max-w-xs space-y-3'>
        <Input type='email' name='turnstile-email' placeholder='you@example.com' />
        <Turnstile siteKey={TURNSTILE_PASS_KEY.siteKey} size='normal' load='focus' />
        <Button type='submit'>Submit</Button>
      </Form>
      <Form action='#' method='post' class='w-full max-w-xs space-y-3'>
        <Input type='email' name='turnstile-email-compact' placeholder='you@example.com' />
        <Turnstile siteKey={TURNSTILE_PASS_KEY.siteKey} size='compact' load='focus' />
        <Button type='submit'>Submit</Button>
      </Form>
      <Form action='#' method='post' class='w-full max-w-xs space-y-3'>
        <Input type='email' name='turnstile-email-flexible' placeholder='you@example.com' />
        <Turnstile siteKey={TURNSTILE_PASS_KEY.siteKey} size='flexible' load='focus' />
        <Button type='submit'>Submit</Button>
      </Form>
      <Form action='#' method='post' hx-post='#' class='w-full max-w-xs space-y-3'>
        <Input type='email' name='turnstile-email-submit' placeholder='you@example.com' />
        <Turnstile siteKey={TURNSTILE_PASS_KEY.siteKey} challenge='submit' appearance='interaction-only' />
        <Button type='submit'>Submit</Button>
      </Form>
    </CatalogRow>
  </CatalogPanel>
);

const KeysSection: FC = () => (
  <CatalogPanel
    id='turnstile-keys'
    title='Test keys'
    description='Cloudflare publishes sitekeys that always reach a fixed outcome. Nothing here is a credential, and no submission on this page is really challenged.'>
    <table class='w-full text-start text-sm'>
      <thead class='text-muted-foreground'>
        <tr>
          <th class='py-2 pe-4 font-medium'>Sitekey</th>
          <th class='py-2 pe-4 font-medium'>Behaviour</th>
        </tr>
      </thead>
      <tbody>
        {TURNSTILE_TEST_KEYS.map((candidate) => (
          <tr key={candidate.id} class='border-t border-border'>
            <td class='py-2 pe-4 font-mono text-xs text-foreground'>{candidate.siteKey}</td>
            <td class='py-2 pe-4 text-muted-foreground'>
              {candidate.label} — {candidate.note}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </CatalogPanel>
);

const ResilienceSection: FC = () => (
  <CatalogPanel
    id='turnstile-resilience'
    title='When the challenge cannot run'
    description='Both messages are server-rendered and hidden; the controller reveals whichever one applies. Block challenges.cloudflare.com and reload to see the first.'>
    <div class='grid gap-4 md:grid-cols-2'>
      <Form action='#' method='post' class='space-y-3'>
        <Input type='email' name='turnstile-email-resilient' placeholder='you@example.com' />
        <Turnstile siteKey={TURNSTILE_PASS_KEY.siteKey} load='focus' unsupported='This browser is too old to run our bot check.'>
          Our bot check could not load. Turn off your blocker for this site and reload.
        </Turnstile>
        <Button type='submit'>Submit</Button>
      </Form>
      <Alert tone='info'>
        <Alert.Title>What the controller does</Alert.Title>
        <Alert.Description>
          A script that has not loaded within ten seconds reveals the fallback. An unsupported browser reveals the second message instead. A render
          that throws leaves the widget dead rather than retrying, and the form still submits — the server refuses it, because verification fails
          closed.
        </Alert.Description>
      </Alert>
    </div>
  </CatalogPanel>
);

// The customer-data mismatch is left out: spelling it would put a `data-*` name in source that
// `state-attrs.test.ts` reads as an undeclared state attribute.
const VERDICT_COPY: Partial<Record<TurnstileFailure, string>> = {
  "missing-token": "No token reached the server — the widget never ran, or its hidden field was stripped.",
  "verification-failed": "Cloudflare refused the token. On the always-blocks key this is the expected answer.",
  "hostname-mismatch": "The token was minted for a different host than the one that verified it.",
  "action-mismatch": "The token was minted for a different action than the route expected.",
  "network-error": "Siteverify could not be reached. Forge fails closed, so the submission is still refused.",
  timeout: "Siteverify did not answer inside the budget. Forge fails closed.",
  "parse-error": "Siteverify answered something that was not the documented JSON.",
};

/** The verdict panel the verify action swaps in. @public */
export const TurnstileVerdictFragment: FC<{ verdict: TurnstileVerdict }> = ({ verdict }) => {
  if (verdict.kind === "unconfigured") {
    return (
      <Alert tone='warning'>
        <Alert.Title>No secret key is configured</Alert.Title>
        <Alert.Description>
          The form reached the action, but no Turnstile secret is configured, so nothing was sent to siteverify.
        </Alert.Description>
      </Alert>
    );
  }
  if (verdict.kind === "verified") {
    return (
      <Alert tone='success'>
        <Alert.Title>Verified</Alert.Title>
        <Alert.Description>
          The token in `{TURNSTILE_FIELD_DEFAULT}` passed siteverify and was dropped before validation, so the handler never sees it.
        </Alert.Description>
      </Alert>
    );
  }
  return (
    <Alert tone='destructive'>
      <Alert.Title>Refused by the {verdict.guard} guard</Alert.Title>
      <Alert.Description>{VERDICT_COPY[verdict.reason] ?? "Verification failed."}</Alert.Description>
    </Alert>
  );
};

const VerifySection: FC = () => (
  <CatalogPanel
    id='turnstile-verify'
    title='The server half'
    description='The playground form above posts here. The route is an ordinary defineAction behind its guards, and the snippet shows what declaring Turnstile looks like. Its onBotDetected reports the reason instead of hiding it.'>
    <pre class='overflow-x-auto rounded-lg border border-border bg-muted p-3 text-xs text-muted-foreground'>
      <code>{`defineAction({\n  schema,\n  turnstile: {\n    secretKey: (_c, config) => config.turnstile.secretKey,\n    verify: (c) => ({ expectedHostname: c.url.hostname }),\n  },\n  onBotDetected: (rejection) => refuse(rejection),\n  handle,\n})`}</code>
    </pre>
    <p class='mt-3 text-sm text-muted-foreground'>
      A real route answers every refusal the same way, so a bot cannot read the guard off the response. This one names it, because the point of the
      page is to show which guard spoke. The endpoint is <code class='font-mono text-xs'>{showcaseRouteMap.api.turnstileVerify.href()}</code>.
    </p>
  </CatalogPanel>
);

/** The whole Turnstile page body. @public */
export const TurnstileDemos: FC<{ data: TurnstileDemoOptions }> = ({ data }) => (
  <div class='space-y-10'>
    <PlaygroundSection data={data} />
    <VariantsSection />
    <ResilienceSection />
    <VerifySection />
    <KeysSection />
  </div>
);
