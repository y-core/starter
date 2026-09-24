/** @jsxRuntime automatic */
/** @jsxImportSource @y-core/forge/jsx */
import { definePage, renderShell } from "@y-core/forge/app";
import { AuthStoreError } from "@y-core/forge/auth";
import { requestLog } from "@y-core/forge/logging";

import type { AppConfig, AppEnv } from "../../../app/types";
import { resolveAuthRequestServices } from "../../app/auth";

/** Forge's outcome by stage, with a store being down told apart from a refusal of the link itself. */
type EmailChangeConfirmData = { outcome: "moved" } | { outcome: "forwarded"; sentTo: string } | { outcome: "unavailable" } | { outcome: "refused" };

const STATUS: Record<EmailChangeConfirmData["outcome"], number> = { moved: 200, forwarded: 200, unavailable: 503, refused: 400 };

const MOVED = "Your email address has been changed. Sign in again to continue.";
const UNAVAILABLE = "Something went wrong on our side. Try the link again in a few minutes.";
const REFUSED = "That confirmation link is no longer valid. Request the change again from your account.";

function copy(data: EmailChangeConfirmData): string {
  if (data.outcome === "moved") return MOVED;
  if (data.outcome === "forwarded") return `Check ${data.sentTo} for the last link, and open it to finish the change.`;
  return data.outcome === "unavailable" ? UNAVAILABLE : REFUSED;
}

// A GET that mutates, which is the shape forge's `confirm(token, now)` seam implies. The address is
// rendered to the link's holder by design and reaches no log line — the codes logged below are forge's.
export const emailChangeConfirmController = definePage<AppEnv, AppConfig, EmailChangeConfirmData>({
  cache: "no-store",
  loader: async (c, _config) => {
    const token = c.url.searchParams.get("token");
    if (token === null || token === "") return { outcome: "refused" };

    const services = await resolveAuthRequestServices(c);
    const outcome = await services.emailChange.confirm(token, Date.now());
    if (!outcome.ok) {
      const code = outcome.error instanceof AuthStoreError ? outcome.error.code : outcome.error;
      if (code === "unavailable" || outcome.error instanceof AuthStoreError) {
        requestLog.get(c).error("Email change confirmation could not reach the store", { code });
        return { outcome: "unavailable" };
      }
      requestLog.get(c).warn("Email change confirmation refused", { reason: code });
      return { outcome: "refused" };
    }
    if (outcome.data.status === "forwarded") return { outcome: "forwarded", sentTo: outcome.data.sentTo };
    return { outcome: "moved" };
  },
  view: (c, _config, state) =>
    renderShell(
      c,
      <main id='main-content' class='mx-auto flex max-w-md flex-col gap-4 px-6 py-16'>
        <h1 class='font-serif text-2xl font-semibold text-balance'>Email change</h1>
        <p class='text-muted-foreground'>{copy(state.data)}</p>
      </main>,
      { mount: "app", page: "email-change-confirm", meta: { title: "Email change", robots: "noindex" } },
      { status: STATUS[state.data.outcome] },
    ),
});
