/** @jsxRuntime automatic */
/** @jsxImportSource @y-core/forge/jsx */

import type { JSXNode } from "@y-core/forge/jsx";
import { Button } from "@y-core/forge/ui/core";

import type { HeroCta, HomeContent } from "../model/types";

interface HomeViewProps {
  content: HomeContent;
  ctas: readonly HeroCta[];
  sections: JSXNode[];
}

export function HomeView({ content, ctas, sections }: HomeViewProps) {
  return (
    <main id='main-content'>
      <section id='home' class='mx-auto grid max-w-7xl items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:px-10 lg:py-24'>
        <div class='space-y-8'>
          <p class='text-sm font-semibold tracking-eyebrow text-primary uppercase'>Digital Product Studio</p>
          <div class='space-y-5'>
            <p class='max-w-xl font-serif text-4xl leading-tight text-balance text-foreground sm:text-5xl'>{content.hero.headline}</p>
            <p class='max-w-lg text-base leading-relaxed text-pretty text-muted-foreground'>{content.hero.subtext}</p>
          </div>
          {ctas.length > 0 && (
            <div class='flex flex-wrap justify-center gap-4 lg:justify-start'>
              {ctas.map((cta) =>
                cta.emphasis === "primary" ? (
                  <Button asChild={true} size='lg'>
                    <a href={cta.href}>{cta.label}</a>
                  </Button>
                ) : (
                  <Button asChild={true} size='lg' tone='neutral' appearance='outline'>
                    <a href={cta.href}>{cta.label}</a>
                  </Button>
                ),
              )}
            </div>
          )}
        </div>
      </section>
      {sections}
    </main>
  );
}
