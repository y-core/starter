/// <reference types="@y-core/forge/testing/node" />
// File-scoped, so the Worker half of the program keeps `"types": []`.

/** Forge's form pipeline inside workerd, on a fixture route every copy of this repository keeps. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { createCsrfToken, CSRF_FIELD_DEFAULT, CSRF_HEADER_DEFAULT, FORM_MAX_BYTES_DEFAULT, importCsrfKey } from "@y-core/forge/form";
import { type DevServer, startDevServer } from "@y-core/forge/testing/workerd";

import { CONFIG_ENV, CSRF_SECRET } from "../env";

const PIPELINE_PATH = "/fixture/pipeline";

let server: DevServer;

beforeAll(async () => {
  server = await startDevServer({ entry: "tests/workerd/middleware.worker.ts", vars: CONFIG_ENV, readyPath: "/api/health" });
}, 200_000);

afterAll(() => {
  server?.stop();
});

/** A token for the fixture path, signed with the key the fixture's guard verifies against and bound to no subject. */
async function token(): Promise<string> {
  return createCsrfToken(await importCsrfKey(CSRF_SECRET), PIPELINE_PATH);
}

interface Submission {
  fields: Record<string, string>;
  headers?: Record<string, string>;
}

function submit({ fields, headers = {} }: Submission): Promise<Response> {
  return fetch(`${server.origin}${PIPELINE_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", Origin: server.siteOrigin, ...headers },
    body: new URLSearchParams(fields).toString(),
  });
}

describe("POST to a route behind the form pipeline under workerd", () => {
  it("accepts a declared field under a header token", async () => {
    const res = await submit({ fields: { message: "hello" }, headers: { [CSRF_HEADER_DEFAULT]: await token() } });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("refuses a body over the form cap with 413, so the streaming meter still runs", async () => {
    const res = await submit({ fields: { message: "x".repeat(FORM_MAX_BYTES_DEFAULT) }, headers: { [CSRF_HEADER_DEFAULT]: await token() } });

    expect(res.status).toBe(413);
  });

  it("reads the token from the body field, where the guard parses the body before the pipeline does", async () => {
    const res = await submit({ fields: { message: "hello", [CSRF_FIELD_DEFAULT]: await token() } });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("refuses a field the strict schema does not declare with 422", async () => {
    const res = await submit({ fields: { message: "hello", extra: "smuggled" }, headers: { [CSRF_HEADER_DEFAULT]: await token() } });

    expect(res.status).toBe(422);
  });

  it("refuses a submission carrying no token anywhere with 403", async () => {
    const res = await submit({ fields: { message: "hello" } });

    expect(res.status).toBe(403);
  });

  it("refuses a submission from a foreign origin with 403, token and all", async () => {
    const res = await submit({
      fields: { message: "hello" },
      headers: { [CSRF_HEADER_DEFAULT]: await token(), Origin: "https://attacker.example" },
    });

    expect(res.status).toBe(403);
  });
});
