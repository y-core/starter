import type { v } from "@y-core/forge/validation";

import type { EmailConfigEntries } from "./config";

/** The email service's slice of the configuration. @public */
export type EmailConfig = v.InferOutput<(typeof EmailConfigEntries)["email"]>;
