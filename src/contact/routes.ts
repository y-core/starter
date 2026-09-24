import { post, route } from "@y-core/forge/router";

export const contactRouteMap = route({ submit: post("/api/contact") });
