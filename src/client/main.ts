import "@y-core/forge/ui/show/client";
// Side-effect-imports `ui/core/client` since forge 0.0.73.
import "@y-core/forge/ui/chrome/client";
import "@y-core/forge/auth/client";
import { resume } from "@y-core/forge/ui/client";
import { htmx } from "@y-core/forge/ui/client/htmx";

// htmx swaps 2xx/3xx only, so without this a refused submission's 422 fragment is dropped and the
// form appears to do nothing. First match wins, hence the unshift ahead of the built-in `[45]..`.
htmx.config.responseHandling.unshift({ code: "422", swap: true });

// The side-effect imports above register the `navbar` and `turnstile` scopes, so `resume()` is the
// whole of the mounting this app does.
resume();
