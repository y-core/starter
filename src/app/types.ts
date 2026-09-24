import type { AppContext as ForgeAppContext } from "@y-core/forge/context";
import type { JSXNode } from "@y-core/forge/jsx";
import type { v } from "@y-core/forge/validation";

import type { AppConfigSchema } from "./config";

/** This deployment's validated configuration, as every handler and guard reads it. @public */
export type AppConfig = v.InferOutput<typeof AppConfigSchema>;

/** The navbar filters this request's viewer holds and the slots rendered for them, merged from every contributed resolver. @public */
export interface NavState {
  activeFilters: string[];
  slots: Record<string, JSXNode>;
}

/** The per-request presentation values a view is rendered against. @public */
export interface RenderContext {
  baseUrl?: string | undefined;
  nonce: string;
  /** What the shared navbar shows this request's viewer. */
  nav: NavState;
}

/** This Worker's bindings, as declared in `wrangler.jsonc`. @public */
export type AppEnv = Env;

/** The request context every controller, guard and view of this app receives. @public */
export type AppContext = ForgeAppContext<AppEnv, Record<string, string>, AppConfig>;
