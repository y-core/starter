import "@y-core/forge/ui/show/client";
// Side-effect-imports `ui/core/client` since forge 0.0.73.
import "@y-core/forge/ui/chrome/client";
import { mountTurnstile, resume } from "@y-core/forge/ui/client";
import { htmx } from "@y-core/forge/ui/client/htmx";

// A refused submission answers 422, and htmx's default `responseHandling` swaps 2xx/3xx only — so
// without this entry the error fragment is dropped on the floor and the form appears to do nothing.
// Forge's htmx module configures no `responseHandling`, so this is the app's single mechanism for it
// (rather than `hx-target-422`, which would need the response-targets extension). First match wins,
// hence the unshift ahead of the built-in `[45]..` rule.
htmx.config.responseHandling.unshift({ code: "422", swap: true });

// Nav needs no mount call since forge 0.0.83: `ui/chrome/client` registers a `navbar` resumable
// scope, so the side-effect import above plus `resume()` below is the whole wiring.
// Arg-less since forge 0.0.68: the controller loads the challenge script itself on first engagement
// with the form, reads the theme from `.dark` on `<html>`, resets the token after every completed
// submission, and reveals a visible fallback when the challenge cannot load.
mountTurnstile();
resume();
