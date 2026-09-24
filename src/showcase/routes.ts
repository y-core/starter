import { get, post, route } from "@y-core/forge/router";

export const showcaseRouteMap = route({
  index: get("/showcase/ui"),
  interactive: get("/showcase/ui/interactive"),
  turnstile: get("/showcase/ui/turnstile"),
  runtime: get("/showcase/ui/runtime"),
  htmx: get("/showcase/ui/htmx"),
  chrome: get("/showcase/ui/chrome"),
  theme: get("/showcase/ui/theme"),
  api: {
    preview: get("/showcase/ui/api/preview"),
    validate: get("/showcase/ui/api/validate"),
    search: get("/showcase/ui/api/search"),
    paginate: get("/showcase/ui/api/paginate"),
    dependent: get("/showcase/ui/api/dependent"),
    toast: get("/showcase/ui/api/toast"),
    avatar: get("/showcase/ui/api/avatar"),
    turnstileVerify: post("/showcase/ui/api/turnstile-verify"),
  },
});
