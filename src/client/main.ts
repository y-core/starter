import "@y-core/forge/ui/show/client";
// Side-effect-imports `ui/core/client` since forge 0.0.73.
import "@y-core/forge/ui/chrome/client";
import { resume } from "@y-core/forge/ui/client";
import { htmx } from "@y-core/forge/ui/client/htmx";

// A refused submission answers 422, and htmx's default `responseHandling` swaps 2xx/3xx only — so
// without this entry the error fragment is dropped on the floor and the form appears to do nothing.
// Forge's htmx module configures no `responseHandling`, so this is the app's single mechanism for it
// (rather than `hx-target-422`, which would need the response-targets extension). First match wins,
// hence the unshift ahead of the built-in `[45]..` rule.
htmx.config.responseHandling.unshift({ code: "422", swap: true });

// Nav and Turnstile both need no mount call: `ui/chrome/client` registers the `navbar` scope and
// `ui/core/client` the `turnstile` one, so the side-effect imports above plus `resume()` are the
// whole wiring — and a page that renders no `<Turnstile>` never resumes a Turnstile controller.
resume();
