import "@y-core/forge/ui/client/htmx";
import "@y-core/forge/ui/show/client";
import { isDark, loadScriptOnEvent, mountNav, mountTheme, mountTurnstile, resume } from "@y-core/forge/ui/client";

mountNav();
mountTheme();
loadScriptOnEvent({
  triggerSelector: "[data-ref='turnstile-trigger']",
  event: "focus",
  scriptSrc: "https://challenges.cloudflare.com/turnstile/v0/api.js",
  integrity: false,
});
mountTurnstile(isDark, { onSuccess: "remove" });
resume();
