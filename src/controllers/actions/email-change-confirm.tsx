/** @jsxImportSource @y-core/forge/jsx */
import { definePage, renderShell } from "@y-core/forge/app";
import { requestLog } from "@y-core/forge/logging";

import { resolveAuthRequestServices } from "../../app/auth";
import type { AppConfig, AppEnv } from "../../app/types";

interface EmailChangeConfirmData {
  confirmed: boolean;
}

const CONFIRMED = "Your email address has been changed.";
const REFUSED = "That confirmation link is no longer valid. Request the change again from your account.";

// A GET that mutates, which is the shape forge's `confirm(token, now)` seam implies; filed as
// chore-260909-44. The reason is never rendered — `AuthEmailChangeReason` has no redactor.
export const emailChangeConfirmController = definePage<AppEnv, AppConfig, EmailChangeConfirmData>({
  cache: "no-store",
  loader: async (c, _config) => {
    const token = c.url.searchParams.get("token");
    if (token === null || token === "") return { confirmed: false };

    const services = await resolveAuthRequestServices(c);
    const outcome = await services.emailChange.confirm(token, Date.now());
    if (!outcome.ok) {
      requestLog.get(c).warn("Email change confirmation refused", { reason: String(outcome.error) });
      return { confirmed: false };
    }
    return { confirmed: true };
  },
  view: (c, _config, state) =>
    renderShell(
      c,
      <main id='main-content' class='mx-auto flex max-w-md flex-col gap-4 px-6 py-16'>
        <h1 class='font-serif text-2xl font-semibold text-balance'>Email change</h1>
        <p class='text-muted-foreground'>{state.data.confirmed ? CONFIRMED : REFUSED}</p>
      </main>,
      { mount: "app", page: "email-change-confirm", meta: { title: "Email change", robots: "noindex" } },
      { status: state.data.confirmed ? 200 : 400 },
    ),
});
