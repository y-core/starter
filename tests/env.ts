// Fixture values rather than secrets — hex of the shape the config schema demands, declared once so
// widening the key ring or rotating a fixture is one edit rather than one per spec.
export const CSRF_SECRET = "de7bf4aef360e3a4c3254c9cec7e45d0f1fd98cc2219c62b5b07e826ba1bcc6e";
export const SESSION_SECRET = "6f2b4a7c0d3e5f7a9b1c3d5e9c1c1c5f57bd50b8b2df5b6d5a51c5cb3a8e9d1e";
export const ADMIN_BOOTSTRAP_SECRET = "3d5e9c1c1c5f57bd50b8b2df5b6d5a51c5cb3a8e9d1e6f2b4a7c0d3e5f7a9b1c";
export const AUTH_KEY_RING = "9c1c1c5f57bd50b8b2df5b6d5a51c5cb3a8e9d1e6f2b4a7c0d3e5f7a9b1c3d5e";

// `SITE_ORIGIN` is deliberately absent: every suite points it at the origin it actually drives, and
// a shared default would silently outrank the one a spec meant to set.
/** Every configured scalar `AppConfigSchema` demands, so a new one is one edit rather than eight. */
export const CONFIG_ENV = {
  CSRF_SECRET,
  EMAIL_API_KEY: "test-api-key",
  EMAIL_FROM: "from@example.com",
  EMAIL_TO: "to@example.com",
  TURNSTILE_SECRET_KEY: "test-ts-key",
  TURNSTILE_SITE_KEY: "test-site-key",
  AUTH_KEY_RING,
  SESSION_SECRET,
  ADMIN_BOOTSTRAP_SECRET,
};
