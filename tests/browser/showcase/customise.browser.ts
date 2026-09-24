import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/** The theme customiser on its own route, resumed by the scopes `src/client/main.ts` bundles. */

const ORIGIN = "https://127.0.0.1:8788";

const THEME_PATH = "/showcase/ui/theme";

const SHARE_PATH = "/showcase/ui/theme?";

const COPY_CONFIRM_MS = 2000;

const PRESET_FIELDS = ["grayHue", "grayChroma"];

/** Lets the customiser's rAF-coalesced scheme text and share URL land before the next read. */
function settle(page: Page): Promise<void> {
  return page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

async function openCustomiser(page: Page, search = ""): Promise<void> {
  await page.goto(`${THEME_PATH}${search}`);
  await settle(page);
}

/** What the Worker itself renders at `selector` for the same URL — its text, or one attribute's value. */
async function ssr(page: Page, search: string, selector: string, attribute?: string): Promise<string> {
  const html = await (await page.request.get(`${THEME_PATH}${search}`)).text();
  return page.evaluate(
    ([markup, target, name]) => {
      const el = new DOMParser().parseFromString(markup, "text/html").querySelector(target);
      if (el === null) throw new Error(`the server render has no ${target}`);
      return (name === null ? el.textContent : el.getAttribute(name)) ?? "";
    },
    [html, selector, attribute ?? null] as const,
  );
}

// Painted through a canvas because `light-dark()` resolves at used-value time and a non-legacy
// colour serializes in its own space, so a computed `oklch()` is comparable to nothing.
function paintedHex(page: Page, value: string): Promise<string> {
  return page.evaluate((color) => {
    const probe = document.createElement("div");
    probe.style.color = color;
    document.body.appendChild(probe);
    const computed = getComputedStyle(probe).color;
    probe.remove();
    const context = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d");
    if (context === null) throw new Error("no 2d canvas context");
    context.fillStyle = computed;
    context.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  }, value);
}

function paintedToken(page: Page, property: string): Promise<string> {
  return paintedHex(page, `var(${property})`);
}

/** The `rgb()` a computed colour serializes a `#rrggbb` as. */
function rgbOf(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

/** Move one lever the way a drag does — set the value, then fire the delegated `input` event. */
async function drag(page: Page, dials: readonly (readonly [field: string, value: string])[]): Promise<void> {
  await page.evaluate(
    (moves) => {
      for (const [field, value] of moves) {
        const slider = document.querySelector<HTMLInputElement>(`[data-field="${field}"]`);
        if (slider === null) throw new Error(`no ${field} slider`);
        slider.value = value;
        slider.dispatchEvent(new Event("input", { bubbles: true }));
      }
    },
    dials as [string, string][],
  );
  await settle(page);
}

/** A custom property as the browser resolves it on `<html>`, trimmed of the whitespace CSSOM keeps. */
function rootProperty(page: Page, property: string): Promise<string> {
  return page.evaluate((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(), property);
}

/** Pick a scheme the way a reader does — set the value, then fire the delegated `change`. */
async function choosePreset(page: Page, id: string): Promise<void> {
  await page.evaluate((value) => {
    const picker = document.querySelector("select[data-preset-picker]");
    if (!(picker instanceof HTMLSelectElement)) throw new Error("no preset picker");
    picker.value = value;
    picker.dispatchEvent(new Event("change", { bubbles: true }));
  }, id);
}

// Read off the control, never off a signal: which preset the dials name is derived, so the picker's
// own value is the only place it exists.
function presetValue(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    const picker = document.querySelector("select[data-preset-picker]");
    return picker instanceof HTMLSelectElement ? picker.value : undefined;
  });
}

function sliderValues(page: Page): Promise<Record<string, string | undefined>> {
  return page.evaluate(
    (fields) => Object.fromEntries(fields.map((field) => [field, document.querySelector<HTMLInputElement>(`input[data-field="${field}"]`)?.value])),
    PRESET_FIELDS,
  );
}

/** The gray sliders the Worker renders for `?p=<id>`, which is the preset resolved server-side. */
async function presetSliders(page: Page, id: string): Promise<Record<string, string>> {
  const entries = await Promise.all(
    PRESET_FIELDS.map(async (field) => [field, await ssr(page, `?p=${id}`, `input[data-field="${field}"]`, "value")] as const),
  );
  return Object.fromEntries(entries);
}

const GRAY_11_LIGHT = '[data-scale-row="gray-light"] [data-hex="10"]';

test("the customiser resumes on its own route with no [resume] warning", async ({ page }) => {
  const reports: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") reports.push(message.text());
  });

  const response = await page.goto(THEME_PATH);
  await page.waitForLoadState("load");
  await settle(page);

  expect(response?.status()).toBe(200);
  expect(reports.filter((text) => text.includes("[resume]"))).toEqual([]);
});

test.describe("the customiser's levers", () => {
  test("paint the URL's scheme onto the document before anything is touched", async ({ page }) => {
    await openCustomiser(page, "?gh=256&gc=45");

    expect(await paintedToken(page, "--gray-11")).toBe(await ssr(page, "?gh=256&gc=45", GRAY_11_LIGHT));
    expect(await paintedToken(page, "--gray-1")).toBe(await ssr(page, "?gh=256&gc=45", '[data-scale-row="gray-light"] [data-hex="0"]'));
  });

  test("rewrite --gray-11 on the document when a lever moves", async ({ page }) => {
    await openCustomiser(page);

    expect(await paintedToken(page, "--gray-11")).toBe("#646464");

    await drag(page, [
      ["grayChroma", "45"],
      ["grayHue", "256"],
    ]);

    expect(await paintedToken(page, "--gray-11")).toBe("#53667e");
  });

  // The painter writes one `light-dark()` per property and never watches `<html>`'s class list, so
  // the browser is what selects the branch — through the nested `var()` an `--accent-contrast` carries.
  test("follow the dark class without the painter noticing it changed", async ({ page }) => {
    await openCustomiser(page);
    expect(await paintedToken(page, "--gray-11")).toBe("#646464");

    await page.evaluate(() => document.documentElement.classList.add("dark"));

    expect(await paintedToken(page, "--gray-11")).toBe("#b4b4b4");
    expect(await paintedToken(page, "--accent-contrast")).toBe("#eeeeee");
  });

  test("apply a preset the moment it is chosen, with no submit and no navigation", async ({ page }) => {
    await openCustomiser(page);
    const url = page.url();

    await choosePreset(page, "slate");

    expect(await paintedToken(page, "--gray-11")).toBe(await ssr(page, "?p=slate", GRAY_11_LIGHT));
    expect(page.url()).toBe(url);
  });

  test("move the sliders a preset drives, which a one-way binding would leave behind", async ({ page }) => {
    await openCustomiser(page);

    await choosePreset(page, "slate");

    expect(await sliderValues(page)).toEqual(await presetSliders(page, "slate"));
    expect(await page.evaluate(() => document.querySelector('[data-readout="grayHue"]')?.textContent)).toBe(
      await ssr(page, "?p=slate", '[data-readout="grayHue"]'),
    );
  });

  test("fall back to custom once a lever leaves the preset it was on", async ({ page }) => {
    await openCustomiser(page);
    expect(await presetValue(page)).toBe("neutral");

    await choosePreset(page, "stone");
    expect(await presetValue(page)).toBe("stone");

    await drag(page, [["grayHue", "120"]]);

    expect(await presetValue(page)).toBe("");
  });

  // The painter writing `custom` back to the signal is what makes this work: one still reading
  // `stone` would make the second pick an `Object.is` no-op, and nothing would move.
  test("re-apply the preset a lever just left", async ({ page }) => {
    await openCustomiser(page);

    await choosePreset(page, "stone");
    await drag(page, [["grayHue", "120"]]);
    expect(await presetValue(page)).toBe("");

    await choosePreset(page, "stone");

    expect(await presetValue(page)).toBe("stone");
    expect(await sliderValues(page)).toEqual(await presetSliders(page, "stone"));
    expect(await paintedToken(page, "--gray-11")).toBe(await ssr(page, "?p=stone", GRAY_11_LIGHT));
  });

  test("repaint a real composed surface, not only the swatches", async ({ page }) => {
    await openCustomiser(page);

    const descriptionColour = async () => {
      const declared = await page.evaluate(() => {
        const el = document.querySelector("#compositions [data-slot~='card-description']");
        return el === null ? null : getComputedStyle(el).color;
      });
      return declared === null ? null : await paintedHex(page, declared);
    };

    const before = await descriptionColour();
    expect(before).not.toBeNull();

    await drag(page, [
      ["grayChroma", "45"],
      ["grayHue", "256"],
    ]);

    const after = await descriptionColour();
    expect(after).not.toBe(before);
    expect(after).toBe("#53667e");
  });

  test("drive --radius directly, since it is a token rather than a scale step", async ({ page }) => {
    await openCustomiser(page);
    expect(await rootProperty(page, "--radius")).toBe("10px");

    await drag(page, [["radius", "2"]]);

    expect(await rootProperty(page, "--radius")).toBe("2px");
  });

  test("keep each readout agreeing with its own slider", async ({ page }) => {
    await openCustomiser(page);

    await drag(page, [["accentHue", "120"]]);

    const readout = await page.evaluate(() => document.querySelector('[data-readout="accentHue"]')?.textContent);
    expect(readout).toBe("120°");
  });

  test("paint every scale row at once, each with its own family and mode", async ({ page }) => {
    await openCustomiser(page);

    const step11 = (row: string) =>
      page.evaluate((id) => {
        const el = document.querySelector<HTMLElement>(`[data-scale-row="${id}"] [data-swatch="10"]`);
        return el === null ? null : getComputedStyle(el).backgroundColor;
      }, row);

    expect(await step11("gray-light")).toBe(rgbOf("#646464"));
    expect(await step11("gray-dark")).toBe(rgbOf("#b4b4b4"));
  });

  test("align every swatch with the step number heading it", async ({ page }) => {
    await openCustomiser(page);

    const drift = await page.evaluate(() => {
      const heads = [...document.querySelectorAll<HTMLElement>("#preview thead tr:last-child th")];
      const swatches = [...document.querySelectorAll<HTMLElement>('[data-scale-row="gray-light"] [data-swatch]')];
      if (heads.length !== 12 || swatches.length !== 12) return { heads: heads.length, swatches: swatches.length, deltas: null };
      return {
        heads: heads.length,
        swatches: swatches.length,
        deltas: heads.map((head, i) => Math.abs(head.getBoundingClientRect().left - (swatches[i]?.getBoundingClientRect().left ?? 0))),
      };
    });

    expect({ heads: drift.heads, swatches: drift.swatches }).toEqual({ heads: 12, swatches: 12 });

    const deltas = drift.deltas ?? [];
    expect(Math.max(...deltas) - Math.min(...deltas)).toBeLessThanOrEqual(1);
    for (const delta of deltas) expect(delta).toBeLessThanOrEqual(6);
  });

  test("give each scale its own bordered box, painted in that scale's own mode", async ({ page }) => {
    await openCustomiser(page);

    const box = (id: string) =>
      page.evaluate((rowId) => {
        const scope = `[data-scale-row="${rowId}"]`;
        const corner = document.querySelector<HTMLElement>(`${scope} tr:first-child td:first-child`);
        const hex = document.querySelector<HTMLElement>(`${scope} [data-hex="0"]`);
        if (corner === null || hex === null) return null;
        const style = getComputedStyle(corner);
        return {
          borderTop: style.borderTopWidth,
          borderLeft: style.borderLeftWidth,
          radius: style.borderTopLeftRadius,
          background: style.backgroundColor,
          mutedText: getComputedStyle(hex).color,
        };
      }, id);

    const frame = { borderTop: "1px", borderLeft: "1px", radius: "8px" };
    const surface = (id: string) => ssr(page, "", `[data-scale-row="${id}"] [data-hex="0"]`);
    expect(await box("gray-light")).toEqual({ ...frame, background: rgbOf(await surface("gray-light")), mutedText: rgbOf("#646464") });
    expect(await box("gray-dark")).toEqual({ ...frame, background: rgbOf(await surface("gray-dark")), mutedText: rgbOf("#b4b4b4") });
  });

  test("round the box's four outside corners and no interior one", async ({ page }) => {
    await openCustomiser(page);

    const radii = await page.evaluate(() => {
      const cell = (selector: string) => {
        const el = document.querySelector<HTMLElement>(selector);
        if (el === null) return null;
        const s = getComputedStyle(el);
        return [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius].join(" ");
      };
      const scope = '[data-scale-row="gray-light"]';
      return {
        topLeft: cell(`${scope} tr:first-child td:first-child`),
        topRight: cell(`${scope} tr:first-child td:last-child`),
        bottomLeft: cell(`${scope} tr:last-child td:first-child`),
        bottomRight: cell(`${scope} tr:last-child td:last-child`),
        interior: cell(`${scope} tr:first-child td:nth-child(6)`),
      };
    });

    expect(radii).toEqual({
      topLeft: "8px 0px 0px 0px",
      topRight: "0px 8px 0px 0px",
      bottomRight: "0px 0px 8px 0px",
      bottomLeft: "0px 0px 0px 8px",
      interior: "0px 0px 0px 0px",
    });
  });

  test("rewrite the printed hex, not only the swatch it labels", async ({ page }) => {
    await openCustomiser(page);

    const printed = () => page.evaluate((selector) => document.querySelector(selector)?.textContent, GRAY_11_LIGHT);
    expect(await printed()).toBe("#646464");

    await drag(page, [
      ["grayChroma", "45"],
      ["grayHue", "256"],
    ]);

    expect(await printed()).toBe(await ssr(page, "?gh=256&gc=45", GRAY_11_LIGHT));
    expect(await printed()).toBe("#53667e");

    const painted = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-scale-row="gray-light"] [data-swatch="10"]');
      return el === null ? null : getComputedStyle(el).backgroundColor;
    });
    expect(painted).toBe(rgbOf("#53667e"));
  });

  test("recompute the live WCAG cells as the dials move", async ({ page }) => {
    await openCustomiser(page);

    const cell = (key: string) => page.evaluate((k) => document.querySelector(`[data-ratio="${k}"]`)?.textContent, key);
    expect(await cell("--muted-foreground|--gray-3:light")).toBe("5.19:1 ✓");

    await drag(page, [
      ["grayChroma", "45"],
      ["grayHue", "256"],
    ]);

    expect(await cell("--muted-foreground|--gray-3:light")).toBe(
      await ssr(page, "?gh=256&gc=45", '[data-ratio="--muted-foreground|--gray-3:light"]'),
    );
    expect(await cell("--muted-foreground|--gray-3:light")).not.toBe("5.19:1 ✓");
    expect(await cell("--muted-foreground|--gray-3:dark")).not.toBe(await cell("--muted-foreground|--gray-3:light"));
  });

  test("update the copyable scheme block as the dials move", async ({ page }) => {
    await openCustomiser(page);
    expect(await page.evaluate(() => document.querySelector("[data-scheme-output] code")?.textContent)).toContain(
      "--gray-11: light-dark(oklch(50.32% 0 0), oklch(76.99% 0 0));",
    );

    await drag(page, [
      ["grayChroma", "45"],
      ["grayHue", "256"],
    ]);

    const output = await page.evaluate(() => document.querySelector("[data-scheme-output] code")?.textContent);
    expect(output).toContain("--gray-11: light-dark(oklch(50.32% 0.0450 256.0), oklch(76.99% 0.0314 256.0));");
    expect(output).not.toContain(".dark {");
  });
});

// The writes below are deferred to one frame, so the pre-frame state is observable only from
// inside the task that dispatched the event — hence the inlined dispatch rather than `drag()`.
test.describe("the customiser's text output", () => {
  test("hold the scheme block and the share URL until the next frame", async ({ page }) => {
    await openCustomiser(page);

    const observed = await page.evaluate(() => {
      interface Printed {
        scheme: string;
        share: string;
      }
      const read = (): Printed => ({
        scheme: document.querySelector("[data-scheme-output] code")?.textContent ?? "",
        share: document.querySelector("[data-share-url]")?.textContent ?? "",
      });
      const before = read();
      const slider = document.querySelector<HTMLInputElement>('[data-field="grayHue"]');
      if (slider === null) throw new Error("no grayHue slider");
      slider.value = "120";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      const sameTask = read();
      return new Promise<{ before: Printed; sameTask: Printed; afterFrame: Printed }>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve({ before, sameTask, afterFrame: read() })));
      });
    });

    expect(observed.sameTask).toEqual(observed.before);
    expect(observed.afterFrame).toEqual({
      scheme: await ssr(page, "?gh=120", "[data-scheme-output] code"),
      share: await ssr(page, "?gh=120", "[data-share-url]"),
    });
    expect(observed.afterFrame.share.startsWith(SHARE_PATH)).toBe(true);
  });

  test("coalesce a multi-lever drag into exactly one frame callback, and print the last value", async ({ page }) => {
    await openCustomiser(page);
    const moves = [
      ["grayHue", "120"],
      ["grayChroma", "45"],
      ["accentHue", "30"],
    ] as const;

    const scheduled = await page.evaluate(
      (dials) => {
        const real = window.requestAnimationFrame.bind(window);
        let count = 0;
        window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
          count += 1;
          return real(callback);
        }) as typeof window.requestAnimationFrame;
        for (const [field, value] of dials) {
          const slider = document.querySelector<HTMLInputElement>(`[data-field="${field}"]`);
          if (slider === null) throw new Error(`no ${field} slider`);
          slider.value = value;
          slider.dispatchEvent(new Event("input", { bubbles: true }));
        }
        window.requestAnimationFrame = real;
        return count;
      },
      moves as unknown as [string, string][],
    );
    await settle(page);

    const moved = "?gh=120&gc=45&ah=30";
    expect(scheduled).toBe(1);
    expect(await page.evaluate(() => document.querySelector("[data-share-url]")?.textContent)).toBe(await ssr(page, moved, "[data-share-url]"));
    expect(await page.evaluate(() => document.querySelector("[data-scheme-output] code")?.textContent)).toBe(
      await ssr(page, moved, "[data-scheme-output] code"),
    );
  });
});

test.describe("the customiser's accent family", () => {
  test("move a swatch, a hex and a ratio together, and no gray hex at all", async ({ page }) => {
    await openCustomiser(page);

    const read = () =>
      page.evaluate(() => ({
        swatch: (() => {
          const el = document.querySelector<HTMLElement>('[data-scale-row="accent-light"] [data-swatch="8"]');
          return el === null ? null : getComputedStyle(el).backgroundColor;
        })(),
        accentHex: document.querySelector('[data-scale-row="accent-light"] [data-hex="8"]')?.textContent,
        grayHex: document.querySelector('[data-scale-row="gray-light"] [data-hex="10"]')?.textContent,
        ratio: document.querySelector('[data-ratio="--primary-foreground|--accent-9:light"]')?.textContent,
      }));

    const before = await read();
    expect(before.swatch).not.toBeNull();
    expect(before.accentHex).toBeTruthy();
    expect(before.ratio).toBeTruthy();

    await drag(page, [["accentHue", "30"]]);

    const after = await read();
    expect(after.accentHex).toBe(await ssr(page, "?ah=30", '[data-scale-row="accent-light"] [data-hex="8"]'));
    expect(after.accentHex).not.toBe(before.accentHex);
    expect(after.swatch).not.toBe(before.swatch);
    expect(after.ratio).not.toBe(before.ratio);
    expect(after.ratio).toBe(await ssr(page, "?ah=30", '[data-ratio="--primary-foreground|--accent-9:light"]'));
    expect(after.grayHex).toBe(before.grayHex);
  });

  // The default-dials case is covered by SSR; what only the browser proves is that the repaint
  // recomputes the number rather than reprinting the one the Worker rendered.
  test("recompute the accent pair live as the dials move, agreeing with SSR at both ends", async ({ page }) => {
    await openCustomiser(page);

    const darkCell = '[data-ratio="--primary-foreground|--accent-9:dark"]';
    const cell = (mode: string) =>
      page.evaluate((m) => document.querySelector(`[data-ratio="--primary-foreground|--accent-9:${m}"]`)?.textContent, mode);
    const before = await cell("dark");
    expect(before).toBe(await ssr(page, "", darkCell));

    await drag(page, [
      ["accentHue", "144"],
      ["accentChroma", "170"],
    ]);

    const after = await cell("dark");
    expect(after).not.toBe(before);
    expect(after).toBe(await ssr(page, "?ah=144&ac=170", darkCell));
    expect(after).toContain("✓");
    expect(await cell("light")).toContain("✓");
  });
});

test.describe("the customiser's copy controls", () => {
  const button = (id: string) => `button[data-copy-target="${id}"]`;

  function control(page: Page, id: string): Promise<{ label: string | undefined; status: string | undefined }> {
    return page.evaluate(
      ([selector, targetId]) => ({
        label: document.querySelector(`${selector} [data-copy-label]`)?.textContent ?? undefined,
        status: document.querySelector(`[data-copy-status="${targetId}"]`)?.textContent ?? undefined,
      }),
      [button(id), id] as const,
    );
  }

  function clipboardText(page: Page): Promise<string> {
    return page.evaluate(() => navigator.clipboard.readText());
  }

  test("write exactly the CSS on the page, then confirm and restore the label", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN });
    await openCustomiser(page);

    const displayed = await page.evaluate(() => document.querySelector("[data-scheme-output] code")?.textContent);
    await page.click(button("css"));

    await expect.poll(() => clipboardText(page)).toBe(displayed ?? "");
    await expect.poll(async () => (await control(page, "css")).label).toBe("Copied");
    expect((await control(page, "css")).status).toBeTruthy();

    await expect.poll(async () => (await control(page, "css")).label, { timeout: COPY_CONFIRM_MS + 2000 }).toBe("Copy CSS");
  });

  test("copy the share URL the page is currently showing, not the one it loaded with", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN });
    await openCustomiser(page);

    await drag(page, [["grayHue", "120"]]);
    const displayed = await page.evaluate(() => document.querySelector("[data-share-url]")?.textContent);
    await page.click(button("url"));

    await expect.poll(() => clipboardText(page)).toBe(displayed ?? "");
    expect(displayed).toContain("gh=120");
  });

  // The branch every plain-HTTP deploy takes. The label must not lie about what happened.
  test("say so and leave the label alone when the browser offers no clipboard", async ({ page }) => {
    await openCustomiser(page);
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined }));

    await page.click(button("css"));

    await expect.poll(async () => (await control(page, "css")).status).toBeTruthy();
    expect((await control(page, "css")).label).toBe("Copy CSS");
  });
});

test.describe("the customiser's compositions band", () => {
  test("sits between the WCAG table and the output, holding its three surfaces", async ({ page }) => {
    await openCustomiser(page);

    const placement = await page.evaluate(() => {
      const wcag = document.getElementById("wcag");
      const band = document.getElementById("compositions");
      const output = document.getElementById("output");
      if (!wcag || !band || !output) return null;
      return {
        afterWcag: wcag.compareDocumentPosition(band) === Node.DOCUMENT_POSITION_FOLLOWING,
        beforeOutput: band.compareDocumentPosition(output) === Node.DOCUMENT_POSITION_FOLLOWING,
        surfaces: [...band.querySelectorAll("section")].map((section) => section.id),
      };
    });

    expect(placement).toEqual({
      afterWcag: true,
      beforeOutput: true,
      surfaces: ["composition-collection", "composition-form", "composition-feedback"],
    });
  });

  test("renders the collection's four states as siblings a reader can tell apart", async ({ page }) => {
    await openCustomiser(page);

    const cards = await page.evaluate(() =>
      [...document.querySelectorAll("#composition-collection [data-slot~='card']")].map((card) => ({
        title: card.querySelector("[data-slot~='card-title']")?.textContent?.trim() ?? "",
        rows: card.querySelectorAll("tbody tr").length,
        skeletons: card.querySelectorAll("[data-slot~='skeleton']").length,
        errors: card.querySelectorAll("[data-slot~='alert'][data-tone='destructive']").length,
      })),
    );

    expect(cards).toEqual([
      { title: "Populated", rows: 5, skeletons: 0, errors: 0 },
      { title: "Empty", rows: 0, skeletons: 0, errors: 0 },
      { title: "Loading", rows: 0, skeletons: 10, errors: 0 },
      { title: "Failed", rows: 0, skeletons: 0, errors: 1 },
    ]);
  });

  test("puts the settings form's controls in the tab order in the order they are written", async ({ page }) => {
    await openCustomiser(page);

    await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("#composition-collection button")].pop()?.focus());

    const reached: string[] = [];
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      reached.push(
        await page.evaluate(() => {
          const el = document.activeElement;
          if (!(el instanceof HTMLElement)) return "nothing focusable";
          return el.getAttribute("name") ?? (el.textContent ?? "").trim();
        }),
      );
    }

    expect(reached).toEqual(["rows-per-page", "row-height", "show-subpath", "Reset", "Save settings"]);
  });
});
