import type { v } from "@y-core/forge/validation";

import type { content } from "./contact.content";
import type { ContactSchema } from "./schema";

/** One parsed contact enquiry, as the email service receives it. @public */
export type ContactSubmission = v.InferOutput<typeof ContactSchema>;

/** The contact section's copy. @public */
export type ContactContent = typeof content;
