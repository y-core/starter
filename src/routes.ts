import { get, post, route } from "@y-core/forge/router";
import { showcaseRoutes } from "@y-core/forge/ui/show";

export const routes = route({
  health: get("/api/health"),
  contact: post("/api/contact"),
  home: get("/"),
  showcase: {
    logs: get("/showcase/logs"),
    ...showcaseRoutes("/showcase/ui"),
  },
});
