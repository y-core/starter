import type { AuthNotifier } from "@y-core/forge/auth";
import { ok } from "@y-core/forge/result";

// Gated rather than deleted: a code nothing delivers is a sign-in nobody can finish locally. Which
// requests may reveal one is `src/app/auth.ts`'s to decide.
/** Builds the PoC `AuthNotifier`, which prints a message instead of mailing it. @public */
export function createConsoleNotifier(reveal: boolean): AuthNotifier {
  return {
    send(message) {
      console.log("auth.notify", {
        kind: message.kind,
        expiresAt: message.expiresAt,
        ...(reveal ? { to: message.to, code: message.code, url: message.url } : {}),
      });
      return Promise.resolve(ok());
    },
  };
}
