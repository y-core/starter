import { get, route } from "@y-core/forge/router";

export const routes = route({ health: get("/api/health"), home: get("/"), logs: get("/logs") });
