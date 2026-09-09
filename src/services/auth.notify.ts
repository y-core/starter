import type { AuthNotifier } from "@y-core/forge/auth";
import { ok } from "@y-core/forge/result";

/** PoC-only `AuthNotifier` that prints the live credential to the console instead of mailing it. */
export const consoleNotifier: AuthNotifier = {
  send(message) {
    console.log("auth.notify", { kind: message.kind, to: message.to, code: message.code, url: message.url, expiresAt: message.expiresAt });
    return Promise.resolve(ok());
  },
};
