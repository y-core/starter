/// <reference types="@y-core/forge/testing/node" />
// File-scoped, so the Worker half of the program keeps `"types": []`.

/** The auth group's form pipeline inside workerd, on a sign-in POST whose answer reads no account. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { CSRF_FIELD_DEFAULT, FORM_MAX_BYTES_DEFAULT } from "@y-core/forge/form";
import { type DevServer, startDevServer } from "@y-core/forge/testing/workerd";

import { CONFIG_ENV } from "../../env";

const ENTRY = "src/worker.dev.ts";

const SIGNIN_PATH = "/auth/signin";

let server: DevServer;

// `wrangler dev` persists the limiter under `.wrangler/state`, so a fixed address would carry one
// run's budget into the next; a per-run octet keeps every case on an address no earlier run spent.
const RUN = Math.floor(Math.random() * 250) + 1;

/** A distinct caller per case, because the auth group's limit counts the minting GET as well as the POST. */
function caller(n: number): string {
  return `10.${RUN}.0.${n}`;
}

beforeAll(async () => {
  server = await startDevServer({ entry: ENTRY, vars: CONFIG_ENV, readyPath: "/api/health" });
}, 200_000);

afterAll(() => {
  server?.stop();
});

/** The session cookie and the `_csrf` token `GET /auth/signin` issues to `ip`. */
async function mint(ip: string): Promise<{ cookie: string; token: string }> {
  const res = await fetch(`${server.origin}${SIGNIN_PATH}`, { headers: { "CF-Connecting-IP": ip } });
  const html = await res.text();
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  const token = new RegExp(`name="${CSRF_FIELD_DEFAULT}" value="([^"]*)"`).exec(html)?.[1];
  if (!cookie.startsWith("__Host-session=") || token === undefined) throw new Error("auth fixture: the sign-in page issued no session or no token");
  return { cookie, token };
}

async function signin(ip: string, cookie: string, body: URLSearchParams): Promise<Response> {
  return fetch(`${server.origin}${SIGNIN_PATH}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      Origin: server.siteOrigin,
      "Sec-Fetch-Site": "same-origin",
      "CF-Connecting-IP": ip,
      cookie,
    },
    body: body.toString(),
  });
}

describe("POST /auth/signin under workerd", () => {
  it("accepts a CSRF token sent only in the body field, answering 303 to /auth/verify", async () => {
    const { cookie, token } = await mint(caller(1));

    const res = await signin(caller(1), cookie, new URLSearchParams({ email: "ada@example.com", [CSRF_FIELD_DEFAULT]: token }));

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/auth/verify");
  });

  it("refuses a sign-in carrying no token anywhere with 403", async () => {
    const { cookie } = await mint(caller(2));

    const res = await signin(caller(2), cookie, new URLSearchParams({ email: "ada@example.com" }));

    expect(res.status).toBe(403);
    expect(await res.text()).toBe("Forbidden");
  });

  it("refuses a body over the form cap with 413, token and all", async () => {
    const { cookie, token } = await mint(caller(3));
    const body = new URLSearchParams({ email: "ada@example.com", [CSRF_FIELD_DEFAULT]: token, pad: "x".repeat(FORM_MAX_BYTES_DEFAULT) });

    const res = await signin(caller(3), cookie, body);

    expect(res.status).toBe(413);
    expect(await res.text()).toBe("Payload Too Large");
  });
});
