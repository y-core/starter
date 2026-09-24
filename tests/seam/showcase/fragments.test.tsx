import { describe, expect, it } from "bun:test";

import { assets } from "@assets";
import { fakeD1, fakeKV } from "@y-core/forge/testing";

import { app } from "../../../src/worker";
import { CONFIG_ENV } from "../../env";

const MINIMUM_ENV = {
  ASSETS: { fetch: async () => new Response("", { status: 200 }) },
  SITE_ORIGIN: "https://example.com",
  ...CONFIG_ENV,
  AUTH_KV: fakeKV(),
  DB: fakeD1(),
} as unknown as Env;

const FRAGMENT_TYPE = "text/html; charset=utf-8";

// Read off the manifest rather than spelled out, because the sprite path carries a content hash.
const SPRITE = assets.path("svg/sprite.svg");

const PREVIEW_NEUTRAL_OUTLINE_SM =
  '<div id="show-preview-button" class="flex items-center justify-center rounded-box border border-border bg-muted p-8"><button type="button" data-slot="button" class="state-busy state-disabled inline-flex items-center justify-center gap-2 rounded-field border-field font-medium whitespace-nowrap focus-ring motion-safe:transition-colors h-control-sm px-3 text-sm [--tone:var(--color-foreground)] [--tone-fg:var(--color-background)] [--tone-text:var(--color-foreground)] [--tone-soft:var(--color-muted)] [--tone-soft-fg:var(--color-foreground)] [--tone-soft-border:var(--color-border)] bg-transparent [--focus-ring:var(--color-ring)] border-input text-foreground hover:bg-accent hover:text-accent-foreground">Preview</button></div>';
const VALIDATE_EMPTY =
  '<fieldset data-slot="field" data-orientation="vertical" class="group/field flex w-full gap-3 data-[invalid]:text-destructive-text flex-col [&amp;&gt;*]:w-full" id="show-validate-field"><label data-slot="field-label" class="flex w-fit items-center gap-2 text-sm leading-snug font-medium text-foreground group-data-[disabled]/field:opacity-50" for="field-email">Email</label><input data-slot="input" data-size="md" class="state-busy state-disabled state-invalid field-chrome focus-ring h-control-md text-sm" type="email" name="email" placeholder="you@example.com" value="" hx-get="/showcase/ui/api/validate" hx-target="#show-validate-field" hx-swap="outerHTML" hx-trigger="change delay:200ms, blur" hx-sync="this:abort" id="field-email"></fieldset>';
const VALIDATE_INVALID =
  '<fieldset data-slot="field" data-invalid="" data-orientation="vertical" class="group/field flex w-full gap-3 data-[invalid]:text-destructive-text flex-col [&amp;&gt;*]:w-full" id="show-validate-field"><label data-slot="field-label" class="flex w-fit items-center gap-2 text-sm leading-snug font-medium text-foreground group-data-[disabled]/field:opacity-50" for="field-email">Email</label><input data-slot="input" data-size="md" class="state-busy state-disabled state-invalid field-chrome focus-ring h-control-md text-sm" type="email" name="email" placeholder="you@example.com" value="not-valid" hx-get="/showcase/ui/api/validate" hx-target="#show-validate-field" hx-swap="outerHTML" hx-trigger="change delay:200ms, blur" hx-sync="this:abort" id="field-email" aria-describedby="field-email-error" aria-invalid="true"><p data-slot="field-error" class="text-sm font-normal text-destructive-text" id="field-email-error" role="alert">Please enter a valid email address.</p></fieldset>';
const VALIDATE_VALID =
  '<fieldset data-slot="field" data-orientation="vertical" class="group/field flex w-full gap-3 data-[invalid]:text-destructive-text flex-col [&amp;&gt;*]:w-full" id="show-validate-field"><label data-slot="field-label" class="flex w-fit items-center gap-2 text-sm leading-snug font-medium text-foreground group-data-[disabled]/field:opacity-50" for="field-email">Email</label><input data-slot="input" data-size="md" class="state-busy state-disabled state-invalid field-chrome focus-ring h-control-md text-sm" type="email" name="email" placeholder="you@example.com" value="user@example.com" hx-get="/showcase/ui/api/validate" hx-target="#show-validate-field" hx-swap="outerHTML" hx-trigger="change delay:200ms, blur" hx-sync="this:abort" id="field-email" aria-describedby="field-email-description"><p data-slot="field-description" class="text-sm leading-normal text-success-text" id="field-email-description">Looks good!</p></fieldset>';
const SEARCH_ALL =
  '<ul id="show-search-results" class="grid grid-cols-2 gap-2 sm:grid-cols-3"><li class="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground">Alert</li><li class="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground">Avatar</li><li class="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground">Badge</li><li class="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground">Button</li><li class="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground">Card</li><li class="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground">Field</li><li class="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground">Form</li><li class="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground">Icon</li><li class="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground">Input</li><li class="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground">Label</li><li class="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground">Popover</li><li class="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground">Progress</li><li class="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground">Select</li><li class="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground">Separator</li><li class="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground">Skeleton</li><li class="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground">Spinner</li><li class="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground">Textarea</li><li class="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground">Toast</li><li class="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground">ToggleGroup</li></ul>';
const SEARCH_BUTTON =
  '<ul id="show-search-results" class="grid grid-cols-2 gap-2 sm:grid-cols-3"><li class="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground">Button</li></ul>';
const SEARCH_NONE =
  '<ul id="show-search-results" class="grid grid-cols-2 gap-2 sm:grid-cols-3"><li class="col-span-3 py-4 text-center text-sm text-muted-foreground">No components match.</li></ul>';
const PAGE_1 =
  '<div id="show-paginate-table"><table class="w-full border-collapse text-sm"><thead><tr class="border-b border-border text-start text-xs font-semibold tracking-wide text-muted-foreground uppercase"><th class="py-2 ps-4 pe-4">#</th><th class="py-2 pe-4">Component</th><th class="py-2 pe-4">Category</th></tr></thead><tbody><tr class="border-b border-border hover:bg-accent"><td class="py-2 ps-4 pe-4 font-mono text-xs text-muted-foreground">1</td><td class="py-2 pe-4 font-medium text-foreground">Alert</td><td class="py-2 pe-4 text-muted-foreground">Feedback</td></tr><tr class="border-b border-border hover:bg-accent"><td class="py-2 ps-4 pe-4 font-mono text-xs text-muted-foreground">2</td><td class="py-2 pe-4 font-medium text-foreground">Avatar</td><td class="py-2 pe-4 text-muted-foreground">Display</td></tr><tr class="border-b border-border hover:bg-accent"><td class="py-2 ps-4 pe-4 font-mono text-xs text-muted-foreground">3</td><td class="py-2 pe-4 font-medium text-foreground">Badge</td><td class="py-2 pe-4 text-muted-foreground">Display</td></tr><tr class="border-b border-border hover:bg-accent"><td class="py-2 ps-4 pe-4 font-mono text-xs text-muted-foreground">4</td><td class="py-2 pe-4 font-medium text-foreground">Button</td><td class="py-2 pe-4 text-muted-foreground">Action</td></tr><tr class="border-b border-border hover:bg-accent"><td class="py-2 ps-4 pe-4 font-mono text-xs text-muted-foreground">5</td><td class="py-2 pe-4 font-medium text-foreground">Card</td><td class="py-2 pe-4 text-muted-foreground">Layout</td></tr><tr class="border-b border-border hover:bg-accent"><td class="py-2 ps-4 pe-4 font-mono text-xs text-muted-foreground">6</td><td class="py-2 pe-4 font-medium text-foreground">Field</td><td class="py-2 pe-4 text-muted-foreground">Form</td></tr></tbody></table><div class="flex items-center justify-between border-t border-border px-4 py-3"><span class="text-xs text-muted-foreground">Page 1 of 4</span><div class="flex gap-2"><button type="button" data-slot="button" class="state-busy state-disabled inline-flex items-center justify-center gap-2 rounded-field border-field font-medium whitespace-nowrap focus-ring motion-safe:transition-colors h-control-sm px-3 text-sm [--tone:var(--color-foreground)] [--tone-fg:var(--color-background)] [--tone-text:var(--color-foreground)] [--tone-soft:var(--color-muted)] [--tone-soft-fg:var(--color-foreground)] [--tone-soft-border:var(--color-border)] bg-transparent [--focus-ring:var(--color-ring)] border-input text-foreground hover:bg-accent hover:text-accent-foreground" hx-get="/showcase/ui/api/paginate?page=2" hx-target="#show-paginate-table" hx-swap="outerHTML">Next</button></div></div></div>';
const PAGE_2 =
  '<div id="show-paginate-table"><table class="w-full border-collapse text-sm"><thead><tr class="border-b border-border text-start text-xs font-semibold tracking-wide text-muted-foreground uppercase"><th class="py-2 ps-4 pe-4">#</th><th class="py-2 pe-4">Component</th><th class="py-2 pe-4">Category</th></tr></thead><tbody><tr class="border-b border-border hover:bg-accent"><td class="py-2 ps-4 pe-4 font-mono text-xs text-muted-foreground">7</td><td class="py-2 pe-4 font-medium text-foreground">Form</td><td class="py-2 pe-4 text-muted-foreground">Form</td></tr><tr class="border-b border-border hover:bg-accent"><td class="py-2 ps-4 pe-4 font-mono text-xs text-muted-foreground">8</td><td class="py-2 pe-4 font-medium text-foreground">Icon</td><td class="py-2 pe-4 text-muted-foreground">Display</td></tr><tr class="border-b border-border hover:bg-accent"><td class="py-2 ps-4 pe-4 font-mono text-xs text-muted-foreground">9</td><td class="py-2 pe-4 font-medium text-foreground">Input</td><td class="py-2 pe-4 text-muted-foreground">Form</td></tr><tr class="border-b border-border hover:bg-accent"><td class="py-2 ps-4 pe-4 font-mono text-xs text-muted-foreground">10</td><td class="py-2 pe-4 font-medium text-foreground">Label</td><td class="py-2 pe-4 text-muted-foreground">Form</td></tr><tr class="border-b border-border hover:bg-accent"><td class="py-2 ps-4 pe-4 font-mono text-xs text-muted-foreground">11</td><td class="py-2 pe-4 font-medium text-foreground">Popover</td><td class="py-2 pe-4 text-muted-foreground">Overlay</td></tr><tr class="border-b border-border hover:bg-accent"><td class="py-2 ps-4 pe-4 font-mono text-xs text-muted-foreground">12</td><td class="py-2 pe-4 font-medium text-foreground">Progress</td><td class="py-2 pe-4 text-muted-foreground">Feedback</td></tr></tbody></table><div class="flex items-center justify-between border-t border-border px-4 py-3"><span class="text-xs text-muted-foreground">Page 2 of 4</span><div class="flex gap-2"><button type="button" data-slot="button" class="state-busy state-disabled inline-flex items-center justify-center gap-2 rounded-field border-field font-medium whitespace-nowrap focus-ring motion-safe:transition-colors h-control-sm px-3 text-sm [--tone:var(--color-foreground)] [--tone-fg:var(--color-background)] [--tone-text:var(--color-foreground)] [--tone-soft:var(--color-muted)] [--tone-soft-fg:var(--color-foreground)] [--tone-soft-border:var(--color-border)] bg-transparent [--focus-ring:var(--color-ring)] border-input text-foreground hover:bg-accent hover:text-accent-foreground" hx-get="/showcase/ui/api/paginate?page=1" hx-target="#show-paginate-table" hx-swap="outerHTML">Previous</button><button type="button" data-slot="button" class="state-busy state-disabled inline-flex items-center justify-center gap-2 rounded-field border-field font-medium whitespace-nowrap focus-ring motion-safe:transition-colors h-control-sm px-3 text-sm [--tone:var(--color-foreground)] [--tone-fg:var(--color-background)] [--tone-text:var(--color-foreground)] [--tone-soft:var(--color-muted)] [--tone-soft-fg:var(--color-foreground)] [--tone-soft-border:var(--color-border)] bg-transparent [--focus-ring:var(--color-ring)] border-input text-foreground hover:bg-accent hover:text-accent-foreground" hx-get="/showcase/ui/api/paginate?page=3" hx-target="#show-paginate-table" hx-swap="outerHTML">Next</button></div></div></div>';
const DEPENDENT_FRUIT =
  '<fieldset data-slot="field" data-orientation="vertical" class="group/field flex w-full data-[invalid]:text-destructive-text flex-col [&amp;&gt;*]:w-full gap-1.5" id="show-dependent-select"><label data-slot="field-label" class="flex w-fit items-center gap-2 text-sm leading-snug font-medium text-foreground group-data-[disabled]/field:opacity-50" for="dependent-item">Item</label><div data-slot="select-wrapper" class="group/select relative w-full has-[select:disabled]:opacity-50"><select data-slot="select" data-size="md" class="state-busy state-disabled state-invalid field-chrome appearance-none pe-10 focus-ring h-control-md text-sm" id="dependent-item" name="item"><option data-slot="select-option" value="apple">Apple</option><option data-slot="select-option" value="banana">Banana</option><option data-slot="select-option" value="cherry">Cherry</option><option data-slot="select-option" value="mango">Mango</option><option data-slot="select-option" value="papaya">Papaya</option></select><span aria-hidden="true" data-slot="select-icon" class="pointer-events-none absolute inset-y-0 end-3 flex items-center text-muted-foreground"></span></div></fieldset>';
const DEPENDENT_VEGETABLE =
  '<fieldset data-slot="field" data-orientation="vertical" class="group/field flex w-full data-[invalid]:text-destructive-text flex-col [&amp;&gt;*]:w-full gap-1.5" id="show-dependent-select"><label data-slot="field-label" class="flex w-fit items-center gap-2 text-sm leading-snug font-medium text-foreground group-data-[disabled]/field:opacity-50" for="dependent-item">Item</label><div data-slot="select-wrapper" class="group/select relative w-full has-[select:disabled]:opacity-50"><select data-slot="select" data-size="md" class="state-busy state-disabled state-invalid field-chrome appearance-none pe-10 focus-ring h-control-md text-sm" id="dependent-item" name="item"><option data-slot="select-option" value="broccoli">Broccoli</option><option data-slot="select-option" value="carrot">Carrot</option><option data-slot="select-option" value="celery">Celery</option><option data-slot="select-option" value="kale">Kale</option><option data-slot="select-option" value="spinach">Spinach</option></select><span aria-hidden="true" data-slot="select-icon" class="pointer-events-none absolute inset-y-0 end-3 flex items-center text-muted-foreground"></span></div></fieldset>';
const TOAST_SUCCESS =
  '<div hx-swap-oob="beforeend:#flash-container"><div data-slot="toast" data-tone="success" data-appearance="soft" data-scope="toast" data-island-state="{&quot;duration&quot;:5000}" class="relative flex w-full items-start gap-3 rounded-box border-field py-4 ps-4 shadow-lg [--tone:var(--color-success)] [--tone-fg:var(--color-success-foreground)] [--tone-text:var(--color-success-text)] [--tone-soft:var(--color-status-success-subtle)] [--tone-soft-fg:var(--color-status-success-subtle-foreground)] [--tone-soft-border:var(--color-status-success-border)] border-(--tone-soft-border) bg-(--tone-soft) text-(--tone-soft-fg) [--focus-ring:var(--color-ring)] hover:bg-[color-mix(in_oklab,var(--tone-soft),var(--tone)_8%)] pe-10"><div data-slot="toast-body" class="flex-1 space-y-1"><div data-slot="toast-title" class="text-sm leading-none font-semibold">Success</div><div data-slot="toast-description" class="text-sm opacity-90">This is a success toast notification.</div></div><button type="button" data-slot="toast-close" aria-label="Dismiss notification" data-on-click="dismiss" class="absolute end-2 top-2 inline-flex size-8 items-center justify-center rounded opacity-50 focus-ring hover:opacity-100 motion-safe:transition-opacity"><span aria-hidden="true" class="text-sm leading-none">×</span></button></div></div>';
const TOAST_ERROR =
  '<div hx-swap-oob="beforeend:#flash-container"><div data-slot="toast" data-tone="destructive" data-appearance="soft" data-scope="toast" data-island-state="{&quot;duration&quot;:5000}" class="relative flex w-full items-start gap-3 rounded-box border-field py-4 ps-4 shadow-lg [--tone:var(--color-destructive)] [--tone-fg:var(--color-destructive-foreground)] [--tone-text:var(--color-destructive-text)] [--tone-soft:var(--color-status-danger-subtle)] [--tone-soft-fg:var(--color-status-danger-subtle-foreground)] [--tone-soft-border:var(--color-status-danger-border)] border-(--tone-soft-border) bg-(--tone-soft) text-(--tone-soft-fg) [--focus-ring:var(--color-ring)] hover:bg-[color-mix(in_oklab,var(--tone-soft),var(--tone)_8%)] pe-10"><div data-slot="toast-body" class="flex-1 space-y-1"><div data-slot="toast-title" class="text-sm leading-none font-semibold">Error</div><div data-slot="toast-description" class="text-sm opacity-90">This is a error toast notification.</div></div><button type="button" data-slot="toast-close" aria-label="Dismiss notification" data-on-click="dismiss" class="absolute end-2 top-2 inline-flex size-8 items-center justify-center rounded opacity-50 focus-ring hover:opacity-100 motion-safe:transition-opacity"><span aria-hidden="true" class="text-sm leading-none">×</span></button></div></div>';

function get(path: string): Promise<Response> {
  return app.request(path, {}, MINIMUM_ENV);
}

async function bodyOf(path: string): Promise<string> {
  return (await get(path)).text();
}

// The icon's metrics belong to the generated sprite, so a fragment is matched with each icon cut
// out, and the icons are matched by the sprite symbol they reference.
function withoutIcons(html: string): { markup: string; icons: string[] } {
  const icons = [...html.matchAll(/<use href="([^"]*)"><\/use>/g)].map((match) => match[1] as string);
  return { markup: html.replace(/<svg\b[^>]*>[^]*?<\/svg>/g, ""), icons };
}

describe("preview fragment", () => {
  it("answers 200 with an HTML fragment", async () => {
    const res = await get("/showcase/ui/api/preview");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(FRAGMENT_TYPE);
  });

  it("defaults tone to primary, appearance to solid and size to md", async () => {
    const [bare, explicit, other] = await Promise.all([
      bodyOf("/showcase/ui/api/preview"),
      bodyOf("/showcase/ui/api/preview?tone=primary&appearance=solid&size=md"),
      bodyOf("/showcase/ui/api/preview?tone=neutral&appearance=outline&size=sm"),
    ]);
    expect(bare).toBe(explicit);
    expect(bare).not.toBe(other);
  });

  it("renders the tone, appearance and size the query string names", async () => {
    expect(await bodyOf("/showcase/ui/api/preview?tone=neutral&appearance=outline&size=sm")).toBe(PREVIEW_NEUTRAL_OUTLINE_SM);
  });
});

describe("validate fragment", () => {
  it("answers 200 with an HTML fragment", async () => {
    const res = await get("/showcase/ui/api/validate");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(FRAGMENT_TYPE);
  });

  it("defaults the email to an empty string", async () => {
    expect(await bodyOf("/showcase/ui/api/validate")).toBe(VALIDATE_EMPTY);
  });

  it("shows the error message for an invalid email", async () => {
    expect(withoutIcons(await bodyOf("/showcase/ui/api/validate?email=not-valid"))).toEqual({
      markup: VALIDATE_INVALID,
      icons: [`${SPRITE}#icon-close`],
    });
  });

  it("shows the success message for the valid email the query string carries", async () => {
    expect(await bodyOf("/showcase/ui/api/validate?email=user%40example.com")).toBe(VALIDATE_VALID);
  });
});

describe("search fragment", () => {
  it("answers 200 with an HTML fragment", async () => {
    const res = await get("/showcase/ui/api/search");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(FRAGMENT_TYPE);
  });

  it("lists every component when no term is given", async () => {
    expect(await bodyOf("/showcase/ui/api/search")).toBe(SEARCH_ALL);
  });

  it("filters the results by the term in the query string", async () => {
    expect(await bodyOf("/showcase/ui/api/search?q=button")).toBe(SEARCH_BUTTON);
  });

  it("shows the no-match message for an unrecognised term", async () => {
    expect(await bodyOf("/showcase/ui/api/search?q=zzznomatch")).toBe(SEARCH_NONE);
  });
});

describe("paginate fragment", () => {
  it("answers 200 with an HTML fragment", async () => {
    const res = await get("/showcase/ui/api/paginate");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(FRAGMENT_TYPE);
  });

  it("defaults to page 1, with only a Next button", async () => {
    expect(await bodyOf("/showcase/ui/api/paginate")).toBe(PAGE_1);
  });

  it("renders the page the query string names, with both pager buttons", async () => {
    expect(await bodyOf("/showcase/ui/api/paginate?page=2")).toBe(PAGE_2);
  });

  it("clamps the page to a minimum of 1", async () => {
    expect(await bodyOf("/showcase/ui/api/paginate?page=0")).toBe(PAGE_1);
  });

  // `Math.max` propagates NaN, so an unparseable page used to reach the view: an empty tbody, both
  // pager buttons hidden, and "Page NaN of 4" printed on the page.
  it("falls back to page 1 for a page the query string does not parse as a number", async () => {
    for (const raw of ["abc", "", "NaN", "%20", "e5"]) {
      expect([raw, await bodyOf(`/showcase/ui/api/paginate?page=${raw}`)]).toEqual([raw, PAGE_1]);
    }
  });
});

describe("dependent fragment", () => {
  it("answers 200 with an HTML fragment", async () => {
    const res = await get("/showcase/ui/api/dependent");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(FRAGMENT_TYPE);
  });

  it("defaults the category to fruit", async () => {
    expect(withoutIcons(await bodyOf("/showcase/ui/api/dependent"))).toEqual({ markup: DEPENDENT_FRUIT, icons: [`${SPRITE}#icon-chevron-down`] });
  });

  it("renders the options of the category the query string names", async () => {
    expect(withoutIcons(await bodyOf("/showcase/ui/api/dependent?category=vegetable"))).toEqual({
      markup: DEPENDENT_VEGETABLE,
      icons: [`${SPRITE}#icon-chevron-down`],
    });
  });
});

describe("toast fragment", () => {
  it("answers 200 with an HTML fragment", async () => {
    const res = await get("/showcase/ui/api/toast");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(FRAGMENT_TYPE);
  });

  it("defaults to a success toast swapped out of band into #flash-container", async () => {
    expect(await bodyOf("/showcase/ui/api/toast")).toBe(TOAST_SUCCESS);
  });

  it("renders the toast variant the query string names", async () => {
    expect(await bodyOf("/showcase/ui/api/toast?type=error")).toBe(TOAST_ERROR);
  });
});
