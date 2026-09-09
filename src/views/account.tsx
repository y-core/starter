/** @jsxImportSource @y-core/forge/jsx */

import { AuthFactorsTrigger, AuthSignout } from "@y-core/forge/auth/web";
import type { FC } from "@y-core/forge/jsx";
import { Badge, Button, Card, Separator } from "@y-core/forge/ui/core";

/** What the signed-in landing page renders. */
interface AccountViewProps {
  readonly email: string;
  readonly emailVerifiedAt: number | null;
  readonly createdAt: number | null;
  readonly factorsPath: string;
  readonly emailChangePath: string;
  readonly signoutPath: string;
  readonly signoutToken: string;
}

/** One stored millisecond as a UTC date, machine-readable in the attribute and readable in the text. */
const AccountDate: FC<{ at: number }> = ({ at }) => {
  const moment = new Date(at).toISOString();
  return (
    <time datetime={moment} class='tabular-nums'>
      {moment.slice(0, 10)}
    </time>
  );
};

// Design Read: a signed-in visitor checking what their account is and what can sign it in; the one
// action is opening the sign-in methods; failure is a store that is down, which the fetched panel's
// own route answers with rather than this page.
/** The page a completed sign-in lands on: who you are, what signs you in, and the action that ends the session. */
export const AccountView: FC<AccountViewProps> = ({
  email,
  emailVerifiedAt,
  createdAt,
  factorsPath,
  emailChangePath,
  signoutPath,
  signoutToken,
}) => (
  <Card class='mx-auto w-full max-w-xl'>
    <Card.Header>
      <Card.Title>
        <h1 class='text-xl'>Your account</h1>
      </Card.Title>
      <Card.Description>
        Signed in as <span data-ref='account-email'>{email}</span>
      </Card.Description>
      <Card.Action>
        {emailVerifiedAt === null ? (
          <Badge tone='warning' data-ref='account-verified'>
            Address unverified
          </Badge>
        ) : (
          <Badge tone='success' data-ref='account-verified'>
            Address verified
          </Badge>
        )}
      </Card.Action>
    </Card.Header>
    <Card.Content class='flex flex-col gap-6'>
      {createdAt === null ? null : (
        <p data-ref='account-created' class='max-w-prose text-sm text-pretty text-muted-foreground'>
          This account was created <AccountDate at={createdAt} />.
        </p>
      )}
      {/* The panel is fetched rather than rendered here: reading every factor costs a store round
          trip per offered kind, which a landing page should not pay before anyone asks for it. */}
      <AuthFactorsTrigger loadPath={factorsPath} />
      <Separator />
      <Button asChild tone='neutral' appearance='outline' size='sm' class='self-start'>
        <a href={emailChangePath} data-ref='account-email-change'>
          Change your email address
        </a>
      </Button>
    </Card.Content>
    <Card.Footer>
      <AuthSignout action={signoutPath} csrfToken={signoutToken} />
    </Card.Footer>
  </Card>
);
