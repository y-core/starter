import { describe, expect, it } from "bun:test";

import { resumeScope } from "@y-core/forge/ui/client";
import { ISLAND_STATE_KEY } from "@y-core/forge/ui/contracts";

import { SHOW_SCOPES } from "../../../src/showcase/model/scope-contract";
import "../../../src/showcase/client/scopes";

function fakeScopeRoot(state: string): HTMLElement {
  return {
    dataset: { scope: SHOW_SCOPES.filter, [ISLAND_STATE_KEY]: state },
    querySelectorAll: () => [] as unknown as NodeListOf<HTMLElement>,
    querySelector: () => null,
  } as unknown as HTMLElement;
}

describe("showcase client scope registration", () => {
  it("registers the 'show-filter' scope so it can be resumed", () => {
    const state = resumeScope(fakeScopeRoot('{"query":""}'));
    expect(state).toBeDefined();
    expect(state?.query).toBeDefined();
  });

  it("returns undefined for an unregistered scope name", () => {
    const root = {
      dataset: { scope: "not-registered" },
      querySelectorAll: () => [] as unknown as NodeListOf<HTMLElement>,
      querySelector: () => null,
    } as unknown as HTMLElement;
    expect(resumeScope(root)).toBeUndefined();
  });
});
