import { csrfProtection, importCsrfKey } from "@y-core/forge/form";
import type { MiddlewareHandler } from "@y-core/forge/router";
import { rateLimit, verifyOrigin } from "@y-core/forge/security";
import { configStore } from "../config/app";
import type { AppEnv } from "../context";

export const contactSecurity: MiddlewareHandler<AppEnv> = async (c, next) => {
  // POST-only route — assert the method defensively before any other checks.
  if (c.req.method !== "POST") return c.text("Forbidden", 403);
  const { allowedOrigins } = configStore.get(c.env).site.url;
  if (!verifyOrigin(c.req.raw, allowedOrigins).ok) return c.text("Forbidden", 403);
  if (c.req.header("HX-Request") !== "true") return c.text("Forbidden", 403);
  const ct = c.req.header("content-type") ?? "";
  if (!ct.includes("application/x-www-form-urlencoded")) return c.text("Unsupported Media Type", 415);
  return next();
};

export const rateLimitGuard = rateLimit<AppEnv>({
  limiter: (c) => c.env.RATE_LIMITER,
  required: false,
});

export const csrfVerify = csrfProtection<AppEnv>({
  secret: async (c) => importCsrfKey(configStore.get(c.env).security.csrf.secret),
});
