/** A fixture route carrying forge's form pipeline on the dev entry, so its coverage survives every profile. */
import { defineAction } from "@y-core/forge/app";
import { csrfProtection } from "@y-core/forge/form";
import { createController, createMiddleware, post, route } from "@y-core/forge/router";
import { originProtection, requireFormContentType } from "@y-core/forge/security";
import { formText, v } from "@y-core/forge/validation";

import { originPolicy, resolveCsrfKey } from "../../src/app/config";
import type { AppEnv } from "../../src/app/types";
import { createWorkerModule } from "../../src/worker";
import { devApp } from "../../src/worker.dev";

const pipelineRouteMap = route({ submit: post("/fixture/pipeline") });

devApp.map(
  pipelineRouteMap,
  createController(pipelineRouteMap, {
    actions: {
      submit: {
        middleware: createMiddleware(
          requireFormContentType(),
          originProtection<AppEnv>(originPolicy),
          csrfProtection({ secret: resolveCsrfKey, subject: false }),
        ),
        handler: defineAction({ schema: v.strictObject({ message: formText() }), handle: () => new Response("ok") }),
      },
    },
  }),
);

export default createWorkerModule(devApp);
