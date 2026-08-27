// The suite whose absence hid `bug-260908-17`. `tests/routes.test.ts` stubs `fetch` for the
// siteverify URL, so no case there has ever exercised real Turnstile verification — and a guard that
// could not pass in dev was invisible, because its refusal is a validation refusal by design. These
// cases run the deployed chain inside workerd and call the real siteverify, which the "always passes"
// testing keys answer for any token at all.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { type DevServer, startDevServer } from "./dev-server";

const ENTRY = "src/worker.dev.ts";

// The testing keys, and the hostname siteverify answers for them whatever origin the widget ran on.
// `TURNSTILE_DEV_HOSTNAME` is what makes that answer acceptable, and only `worker.dev.ts` reads it.
const VARS = {
  CSRF_SECRET: "de7bf4aef360e3a4c3254c9cec7e45d0f1fd98cc2219c62b5b07e826ba1bcc6e",
  EMAIL_API_KEY: "test-api-key",
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
  TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  TURNSTILE_DEV_HOSTNAME: "example.com",
};

const VALID = {
  name: "Jane Example",
  email: "jane@example.com",
  phone: "+1 555 012 3456",
  message: "I would like help building a digital product.",
};

const FORM_MAX_BYTES = 100 * 1024;
const BOT_GUARD_WARN = "Submission refused by a bot guard";

// The email API is reached for real and refuses the placeholder key with a 401, so a submission that
// passes every guard ends at the delivery failure rather than at the success fragment. That is still
// the assertion this suite exists to make: a tripped guard answers 422, never 500.
const EXPECTED_DELIVERY_ERROR =
  '<div class="rounded-2xl border border-status-danger-border bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-subtle-foreground"><p>Something went wrong. Please try again or contact us directly.</p></div>';

let server: DevServer;

beforeAll(async () => {
  server = await startDevServer(ENTRY, VARS);
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
async function post(fields: Record<string, string>, ip: string, csrfInBody = false): Promise<Response> {
  const csrf = await token();
  const body = new URLSearchParams(csrfInBody ? { ...fields, _csrf: csrf } : fields);
  return fetch(`${server.origin}/api/contact`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "HX-Request": "true",
      Origin: server.siteOrigin,
      "CF-Connecting-IP": ip,
      ...(csrfInBody ? {} : { "X-CSRF-Token": csrf }),
    },
    body: body.toString(),
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

  it("refuses a body over the cap with 413, so the streaming meter still runs", async () => {
    const res = await post({ ...VALID, message: "x".repeat(FORM_MAX_BYTES), "cf-turnstile-response": "any-string" }, "10.0.0.3");

    expect(res.status).toBe(413);
  });

  it("reads the CSRF token from the body field, where the guard parses the body before the pipeline does", async () => {
    const mark = server.logs().length;

    const res = await post({ ...VALID, "cf-turnstile-response": "any-string" }, "10.0.0.4", true);

    expect(res.status).toBe(500);
    expect(await res.text()).toBe(EXPECTED_DELIVERY_ERROR);
    expect(await logsSince(mark)).not.toContain(BOT_GUARD_WARN);
  });

  // The regression test for `bug-260908-17`: a tripped guard is a 422 naming the schema's first
  // declared field, which is indistinguishable from a wrong `name` on the response alone. The warn
  // line is the only thing that tells the two apart, so both are pinned together.
  it("refuses a submission carrying no Turnstile token, and says so in the log", async () => {
    const mark = server.logs().length;

    const res = await post(VALID, "10.0.0.5");

    expect(res.status).toBe(422);
    expect(refusedFields(await res.text())).toEqual(["name"]);
    expect(await logsSince(mark)).toContain(BOT_GUARD_WARN);
  });
});
