/** One message for the configured recipient, as its sender composed it. @public */
export interface EmailMessage {
  subject: string;
  html: string;
  replyTo: { email: string; name: string };
}
