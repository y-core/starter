import { contextVar } from "@y-core/forge/context";
import type { DevAllowance } from "@y-core/forge/dev";

// Its own module rather than `context.ts`, which reads `authWebPaths` at module scope: `auth.ts`
// needs this accessor, and importing it from there would close an initialization cycle.
/** The development entry's allowance, unset for every request on the production entry, which mints none. @public */
export const devAllowanceCtx = contextVar<DevAllowance>("devAllowance");
