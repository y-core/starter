import type { v } from "@y-core/forge/validation";

import type { ContactSchema } from "./actions/contact";

/** One parsed contact enquiry, as the email service receives it. @public */
export type ContactSubmission = v.InferOutput<typeof ContactSchema>;
