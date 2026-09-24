import { env, requiredGroup } from "@y-core/forge/config";
import { v } from "@y-core/forge/validation";

/** The email slice's entries in `AppConfigSchema`, spread into it by the core config. @public */
export const EmailConfigEntries = {
  // `requiredGroup`, not `v.object`: an `EMAIL_TO=` line arrives as `""`, which `v.string()` takes
  // and the mail service then fails on. No defaults — a placeholder that parses mails into the void.
  email: requiredGroup({ apiKey: v.string(), apiUrl: v.string(), from: v.string(), senderName: v.string(), to: v.string() }),
};

/** The email slice's entries in `appConfig`, read from the environment the schema above validates. @public */
export const emailConfig = {
  email: {
    apiKey: env("EMAIL_API_KEY"),
    apiUrl: "https://api.mailchannels.net/tx/v1/send",
    from: env("EMAIL_FROM"),
    senderName: "Forge Studio",
    to: env("EMAIL_TO"),
  },
};
