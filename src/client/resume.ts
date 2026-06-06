/**
 * Resumable scope registrations.
 *
 * Register scopes here as interactive features are built. The delegated runtime
 * (`resume()`, called once in `main.ts`) resumes a scope on first interaction.
 *
 * Example (Counter):
 *   import { effect } from "@y-core/forge/ui/client";
 *   registerScope("counter", {
 *     setup: ({ root, state }) =>
 *       effect(() => {
 *         root.querySelector("[data-ref='count']")!.textContent = String(state.count!.value);
 *       }),
 *     on: { inc: ({ state }) => { state.count!.value = (state.count!.value as number) + 1; } },
 *   });
 */
import { registerScope } from "@y-core/forge/ui/client";

// Register resumable scopes here as features are built.
void registerScope;
