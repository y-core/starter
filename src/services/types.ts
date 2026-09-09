/** The outcome of an email send — the reason is a code, never a provider message. @public */
export type EmailResult = { ok: true } | { ok: false; reason: string };
