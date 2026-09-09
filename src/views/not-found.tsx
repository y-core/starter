/** @jsxImportSource @y-core/forge/jsx */
import { Button, EmptyState } from "@y-core/forge/ui/core";

import { routes } from "../routes";

export function NotFoundView() {
  return (
    <main id='main-content' class='mx-auto w-full max-w-2xl px-6 py-24'>
      <EmptyState>
        <EmptyState.Figure class='text-sm font-semibold tracking-widest text-primary uppercase'>404</EmptyState.Figure>
        {/* `level={1}`: the empty state is the whole page, so its title is the document's top heading. */}
        <EmptyState.Title level={1} class='font-serif text-4xl text-balance text-foreground'>
          Page not found
        </EmptyState.Title>
        <EmptyState.Description class='text-lg'>The page you are looking for does not exist.</EmptyState.Description>
        <EmptyState.Actions>
          <Button asChild={true} size='lg'>
            <a href={routes.home.href()}>Return home</a>
          </Button>
        </EmptyState.Actions>
      </EmptyState>
    </main>
  );
}
