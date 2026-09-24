/// <reference types="@y-core/forge/testing/node" />
// File-scoped, so the Worker half of the program keeps `"types": []`.

/** The deployed chain inside workerd, calling the real siteverify the seam suite stubs out. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { type DevServer, startDevServer } from "@y-core/forge/testing/workerd";

import { CONFIG_ENV } from "../../env";

const ENTRY = "src/worker.dev.ts";

// The testing keys, whose fixed siteverify hostname only the dev entry's allowance makes acceptable
// — the one thing this suite overrides, because the seam fixtures never reach the real siteverify.
const VARS = { ...CONFIG_ENV, TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA", TURNSTILE_SITE_KEY: "1x00000000000000000000AA" };

const VALID = {
  name: "Jane Example",
  email: "jane@example.com",
  phone: "+1 555 012 3456",
  message: "I would like help building a digital product.",
};

const BOT_GUARD_WARN = "Submission refused by a bot guard";

// The email API is reached for real and refuses the placeholder key, so a submission that clears
// every guard ends here rather than at the success fragment.
const EXPECTED_DELIVERY_ERROR =
  '<div class="rounded-2xl border border-status-danger-border bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-subtle-foreground"><p>Something went wrong. Please try again or contact us directly.</p></div>';

let server: DevServer;

beforeAll(async () => {
  server = await startDevServer({ entry: ENTRY, vars: VARS, readyPath: "/api/health", capture: true });
}, 200_000);

afterAll(() => {
  server?.stop();
});

/** A CSRF token minted for `/api/contact`, read off the page that renders the form. */
async function token(): Promise<string> {
  const html = await fetch(`${server.origin}/`).then((res) => res.text());
  const match = html.match(/name="_csrf" value="([^"]*)"/);
  if (match?.[1] === undefined) throw new Error("contact fixture: the home page rendered no CSRF token");
  return match[1];
}

/** The field names the 422 fragment lists, which `abortEarly` holds to one. */
function refusedFields(body: string): string[] {
  return [...body.matchAll(/<li>([^<]*)<\/li>/g)].map(([, field]) => field ?? "");
}

// One IP per case: `wrangler.jsonc` declares a 5-per-60s rate limit keyed by `CF-Connecting-IP`, so
// cases sharing one would start failing with 429 as the suite grows.
async function post(fields: Record<string, string>, ip: string): Promise<Response> {
  return fetch(`${server.origin}/api/contact`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "HX-Request": "true",
      Origin: server.siteOrigin,
      "CF-Connecting-IP": ip,
      "X-CSRF-Token": await token(),
    },
    body: new URLSearchParams(fields).toString(),
  });
}

/** Everything the dev server printed since `mark`, once its stdout has had a turn to flush. */
async function logsSince(mark: number): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 250));
  return server.logs().slice(mark);
}

describe("POST /api/contact under workerd", () => {
  it("passes every guard for a valid submission, reaching the delivery step", async () => {
    const mark = server.logs().length;

    const res = await post({ ...VALID, "cf-turnstile-response": "any-string" }, "10.0.0.1");

    expect(res.status).toBe(500);
    expect(await res.text()).toBe(EXPECTED_DELIVERY_ERROR);
    expect(await logsSince(mark)).not.toContain(BOT_GUARD_WARN);
  });

  it("names the field that failed, not the first the schema declares", async () => {
    const res = await post({ ...VALID, email: "not-an-email", "cf-turnstile-response": "any-string" }, "10.0.0.2");

    expect(res.status).toBe(422);
    expect(refusedFields(await res.text())).toEqual(["email"]);
  });

  // A tripped guard answers a 422 naming the schema's first field, indistinguishable on the response
  // alone from a wrong `name` — the warn line is the only thing telling the two apart.
  it("refuses a submission carrying no Turnstile token, and says so in the log", async () => {
    const mark = server.logs().length;

    const res = await post(VALID, "10.0.0.5");

    expect(res.status).toBe(422);
    expect(refusedFields(await res.text())).toEqual(["name"]);
    expect(await logsSince(mark)).toContain(BOT_GUARD_WARN);
  });
});
