import { applyMiddlewareChain, type Forge, type MiddlewareGuardGroup } from "@y-core/forge/app";
import { type BindingSpec, bindingSetSchema, getAppContext, type Middleware } from "@y-core/forge/context";
import type { DevAllowance } from "@y-core/forge/dev";
import { consoleChannel, kvLogChannel } from "@y-core/forge/logging";
import { cors, requestIdCtx, type SecurityHeadersOptions } from "@y-core/forge/security";

import { configStore } from "./config";
import { devAllowanceCtx } from "./dev";
import type { AppConfig, AppEnv } from "./types";

/** What one owner adds to the global chain: the bindings it refuses to serve without, its session, and its global and per-path guards. @public */
export interface MiddlewareContribution {
  bindings?: readonly BindingSpec[] | undefined;
  session?: Middleware | undefined;
  globals?: readonly Middleware[] | undefined;
  guards?: readonly MiddlewareGuardGroup<AppEnv>[] | undefined;
}

/** Publishes the development allowance on every request, so a handler takes it from the context rather than from a second entry-point wiring. */
function devAllowanceGuard(dev: DevAllowance): Middleware {
  return (context, next) => {
    devAllowanceCtx.set(getAppContext<AppEnv, Record<string, string>, AppConfig>(context), dev);
    return next();
  };
}

/** Answers a cross-origin API call against the allowlist this request's config carries. */
const corsGuard: Middleware = (context, next) => {
  const c = getAppContext<AppEnv, Record<string, string>, AppConfig>(context);
  return cors({ origins: configStore.get(c.env).site.url.allowedOrigins })(context, next);
};

/** The one session the contributions supply, refusing at startup when two each supply one. */
function contributedSession(contributions: readonly MiddlewareContribution[]): Middleware | undefined {
  const sessions = contributions.flatMap((contribution) => (contribution.session === undefined ? [] : [contribution.session]));
  if (sessions.length > 1) throw new Error("middleware: two contributions each supply a session, and the chain takes one.");
  return sessions[0];
}

/** Registers the one global chain, merging every contribution into it in array order. */
export function registerMiddleware(
  app: Forge<AppEnv>,
  security: SecurityHeadersOptions,
  contributions: readonly MiddlewareContribution[],
  dev?: DevAllowance,
): void {
  const session = contributedSession(contributions);
  applyMiddlewareChain<AppEnv>(app, {
    // Ahead of `requestId`, because a handler may read the allowance and nothing here renders with
    // the nonce (`forge/ROUTING_AND_MIDDLEWARE.md` §3e).
    ...(dev === undefined ? {} : { before: [devAllowanceGuard(dev)] }),
    // Cloudflare rewrites `CF-*` at the edge, so on Workers they are trustworthy; forge defaults to
    // distrust because the same code behind a bare proxy would let a caller forge them.
    trustCfHeaders: true,
    logging: {
      // No `redact`: no handler here writes a submitted field into a record, so forge's default set is
      // the whole policy.
      channels: (c) => (c.env.LOGS_KV ? [consoleChannel(), kvLogChannel(c.env.LOGS_KV)] : [consoleChannel()]),
      bindings: (c) => ({ requestId: requestIdCtx.getOptional(c) }),
    },
    securityHeaders: security,
    // The refusal this schema raises throws, which is why the builder runs it after the headers
    // (`forge/ROUTING_AND_MIDDLEWARE.md` §3e).
    bindings: bindingSetSchema([
      { name: "LOGS_KV", methods: ["get", "put", "list"], label: "a KV namespace binding", optional: true },
      ...contributions.flatMap((contribution) => contribution.bindings ?? []),
    ]),
    ...(session === undefined ? {} : { session }),
    globals: contributions.flatMap((contribution) => contribution.globals ?? []),
    guards: [{ paths: ["/api/*"], guards: [corsGuard] }, ...contributions.flatMap((contribution) => contribution.guards ?? [])],
  });
}
