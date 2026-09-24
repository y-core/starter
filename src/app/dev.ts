import { contextVar } from "@y-core/forge/context";
import type { DevAllowance } from "@y-core/forge/dev";

/** The development entry's allowance, unset for every request on the production entry, which mints none. @public */
export const devAllowanceCtx = contextVar<DevAllowance>("devAllowance");
