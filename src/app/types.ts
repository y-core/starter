import type { AuthNav } from "@y-core/forge/auth/web";
import type { AppContext as ForgeAppContext } from "@y-core/forge/context";
import type { v } from "@y-core/forge/validation";

import type { AppConfigSchema } from "./config";

/** This deployment's validated configuration, as every handler and guard reads it. @public */
export type AppConfig = v.InferOutput<typeof AppConfigSchema>;

/** The email service's slice of the configuration. @public */
export type EmailConfig = AppConfig["services"]["email"];

/** A factor a visitor enrols in deliberately, as opposed to the emailed code, which is implicit. @public */
export type StepUpFactor = "totp-app" | "passkey";

/** The per-request presentation values a view is rendered against. @public */
export interface RenderContext {
  baseUrl?: string | undefined;
  csrfToken: string;
  nonce: string;
  turnstileSiteKey?: string | undefined;
  /** What the shared navbar shows this request's viewer, and the sign-out control when there is one. */
  nav: AuthNav;
}

/** This Worker's bindings, as declared in `wrangler.jsonc`. @public */
export type AppEnv = Env;

/** The request context every controller, guard and view of this app receives. @public */
export type AppContext = ForgeAppContext<AppEnv, Record<string, string>, AppConfig>;
