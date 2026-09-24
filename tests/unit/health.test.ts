import { describe, expect, it } from "bun:test";

import { createHealthSlots, type HealthCheck } from "../../src/controllers/health";

const pass: HealthCheck = () => true;
const fail: HealthCheck = () => false;
const slow: HealthCheck = async () => true;

describe("createHealthSlots", () => {
  it("holds no checks until something is contributed", () => {
    expect(createHealthSlots().checks()).toEqual({});
  });

  it("holds every check of two contributions whose names are disjoint", () => {
    const slots = createHealthSlots();

    slots.contribute({ csrf: pass });
    slots.contribute({ schema: fail });

    const checks = slots.checks();
    expect(Object.keys(checks).sort()).toEqual(["csrf", "schema"]);
    expect(checks.csrf).toBe(pass);
    expect(checks.schema).toBe(fail);
  });

  it("refuses a name already contributed, and keeps the first check under it", () => {
    const slots = createHealthSlots();
    slots.contribute({ schema: pass });

    expect(() => slots.contribute({ schema: fail })).toThrow(/^health: the check "schema" is already contributed\.$/);
    expect(slots.checks().schema).toBe(pass);
  });

  it("writes nothing from a contribution that repeats any one name", () => {
    const slots = createHealthSlots();
    slots.contribute({ csrf: pass });

    expect(() => slots.contribute({ fresh: slow, csrf: fail })).toThrow(/^health: the check "csrf" is already contributed\.$/);
    expect(slots.checks()).toEqual({ csrf: pass });
  });
});
