import { get, post, route } from "@y-core/forge/router";

export const routes = route({ health: get("/api/health"), contact: post("/api/contact"), home: get("/"), adminLogs: get("/admin/logs") });
