/** @jsxImportSource @y-core/forge */
import type { RenderContext } from "../app/context";
import { routes } from "../routes";
import { Layout } from "./layout";

export function NotFoundView({ ctx }: { ctx: RenderContext }) {
  return (
    <Layout ctx={ctx}>
      <main id='main-content' class='flex min-h-[60vh] flex-col items-center justify-center px-6 py-24 text-center'>
        <p class='text-sm font-semibold uppercase tracking-widest text-primary'>404</p>
        <h1 class='mt-4 font-display text-4xl text-foreground'>Page not found</h1>
        <p class='mt-4 text-lg text-muted-foreground'>The page you are looking for does not exist.</p>
        <a
          href={routes.home.href()}
          class='mt-8 rounded-full bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90'>
          Return home
        </a>
      </main>
    </Layout>
  );
}
