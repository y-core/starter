import "@y-core/forge/ui/client/htmx";
import "@y-core/forge/ui/show/client";
import "@y-core/forge/ui/chrome/client";
import { isDark } from "@y-core/forge/ui/chrome/client";
import { loadScriptOnEvent, mountNav, mountTurnstile, resume } from "@y-core/forge/ui/client";

mountNav();
loadScriptOnEvent({
  triggerSelector: "[data-ref='turnstile-trigger']",
  event: "focus",
  scriptSrc: "https://challenges.cloudflare.com/turnstile/v0/api.js",
  integrity: false,
});
mountTurnstile(isDark, { onSuccess: "remove" });
resume();
