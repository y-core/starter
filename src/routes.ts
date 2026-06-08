import { get, post, route } from "@y-core/forge/router";

export const routes = route({
  health: get("/api/health"),
  contact: post("/api/contact"),
  home: get("/"),
  showcase: {
    logs: get("/showcase/logs"),
    ui: {
      index: get("/showcase/ui"),
      api: {
        preview: get("/showcase/ui/api/preview"),
        validate: get("/showcase/ui/api/validate"),
        search: get("/showcase/ui/api/search"),
        paginate: get("/showcase/ui/api/paginate"),
        dependent: get("/showcase/ui/api/dependent"),
        toast: get("/showcase/ui/api/toast"),
      },
    },
  },
});
