import { readFields } from "@y-core/forge/form";
import type { ValidationResult } from "@y-core/forge/result";
import { v } from "@y-core/forge/validation";

export type ContactSubmission = { name: string; email: string; phone?: string; message: string };

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const MAX_PHONE_LENGTH = 20;
const MIN_MESSAGE_LENGTH = 15;
const MAX_MESSAGE_LENGTH = 2000;
const phonePattern = /^[\d\s\-+()]*$/;

const ContactSchema = v.object({
  name: v.pipe(
    v.string(),
    v.transform((val) =>
      val
        .replace(/[\r\n]/g, " ")
        .replace(/ {2,}/g, " ")
        .trim(),
    ),
    v.nonEmpty("Name is required."),
    v.maxLength(MAX_NAME_LENGTH, `Name must be ${MAX_NAME_LENGTH} characters or fewer.`),
  ),
  email: v.pipe(
    v.string(),
    v.trim(),
    v.nonEmpty("A valid email address is required."),
    v.maxLength(MAX_EMAIL_LENGTH, "A valid email address is required."),
    v.email("A valid email address is required."),
  ),
  phone: v.pipe(
    v.string(),
    v.trim(),
    v.maxLength(MAX_PHONE_LENGTH, `Contact number must be ${MAX_PHONE_LENGTH} characters or fewer.`),
    v.regex(phonePattern, "Contact number may only contain digits, spaces, dashes, and plus signs."),
    v.transform((val): string | undefined => (val === "" ? undefined : val)),
  ),
  message: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(MIN_MESSAGE_LENGTH, `Message must be at least ${MIN_MESSAGE_LENGTH} characters.`),
    v.maxLength(MAX_MESSAGE_LENGTH, `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`),
  ),
});

export function validateContact(formData: FormData): ValidationResult<ContactSubmission> {
  const raw = readFields(formData, ["name", "email", "phone", "message"]);

  const result = v.safeParse(ContactSchema, raw, { abortPipeEarly: true });

  if (!result.success) {
    return { ok: false, errors: result.issues.map((issue) => issue.message) };
  }

  return { ok: true, data: result.output };
}
