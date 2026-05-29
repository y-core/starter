/** @jsxImportSource @y-core/forge */
export function NotFound() {
  return (
    <main id="main-content" class="flex min-h-[60vh] flex-col items-center justify-center px-6 py-24 text-center">
      <p class="text-sm font-semibold uppercase tracking-widest text-brand-600">404</p>
      <h1 class="mt-4 font-display text-4xl text-brand-900 dark:text-brand-50">Page not found</h1>
      <p class="mt-4 text-lg text-stone-600 dark:text-brand-200">The page you are looking for does not exist.</p>
      <a href="/" class="mt-8 rounded-full bg-brand-600 px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-brand-700">
        Return home
      </a>
    </main>
  );
}
