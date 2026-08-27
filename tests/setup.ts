// Polyfill URLPattern for Bun test environment (not built into Bun's runtime).
import "urlpattern-polyfill";

function suppressLogger(original: (...args: unknown[]) => void) {
  return (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === "string" && first.startsWith("{")) {
      try {
        const obj = JSON.parse(first);
        if ("level" in obj && "prefix" in obj && "message" in obj) return;
      } catch {}
    }
    original.apply(console, args);
  };
}

// Since forge 0.0.67 `Config.get(env)` caches per distinct `env` object in a WeakMap rather than
// first-env-wins, so one file's `CSRF_SECRET` can no longer leak into the next and the
// `beforeEach(() => configStore.reset())` this file used to carry is no longer load-bearing.
// `reset()` still exists — reinstate it here if a future test mutates a shared env object in place.

// Suppress structured logger output (JSON lines with level+prefix+message).
console.log = suppressLogger(console.log);
console.warn = suppressLogger(console.warn);
console.error = suppressLogger(console.error);
