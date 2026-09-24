import { formMultilineText, formText, v } from "@y-core/forge/validation";

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const MAX_PHONE_LENGTH = 20;
const MIN_MESSAGE_LENGTH = 15;
const MAX_MESSAGE_LENGTH = 2000;
const phonePattern = /^[\d\s\-+()]*$/;
// Forge's auth forms pair the same two checks, but their `emailField()` is private to forge and
// carries forge's own copy — `v.rfcEmail` alone admits `ada@localhost`, which nothing can reply to.
const deliverableDomain = /@[^@]+\.[^@]+$/;

/** The contact form's shape: `v.strictObject`, which refuses an undeclared field, over form-aware string types. */
export const ContactSchema = v.strictObject({
  name: v.pipe(
    formText(),
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
    formText(),
    v.nonEmpty("A valid email address is required."),
    v.maxLength(MAX_EMAIL_LENGTH, "A valid email address is required."),
    v.rfcEmail("A valid email address is required."),
    v.regex(deliverableDomain, "A valid email address is required."),
  ),
  // `formToObject` leaves an absent field absent rather than substituting `""`, so without
  // `v.optional` every submission with the input left blank would 422 (`INPUT_VALIDATION.md` §1d).
  phone: v.optional(
    v.pipe(
      formText(),
      v.maxLength(MAX_PHONE_LENGTH, `Contact number must be ${MAX_PHONE_LENGTH} characters or fewer.`),
      v.regex(phonePattern, "Contact number may only contain digits, spaces, dashes, and plus signs."),
      v.transform((val): string | undefined => (val === "" ? undefined : val)),
    ),
  ),
  message: v.pipe(
    formMultilineText(),
    v.minLength(MIN_MESSAGE_LENGTH, `Message must be at least ${MIN_MESSAGE_LENGTH} characters.`),
    v.maxLength(MAX_MESSAGE_LENGTH, `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`),
  ),
});
