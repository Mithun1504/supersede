import { describe, expect, it } from "vitest";

import {
  can,
  isPermissionCode,
  isRoleCode,
  permissionCodes,
} from "@/modules/identity/permissions";

describe("identity permission catalog", () => {
  it("contains unique stable permission codes", () => {
    expect(new Set(permissionCodes).size).toBe(permissionCodes.length);
    expect(permissionCodes).toHaveLength(30);
  });

  it("narrows only known roles and permissions", () => {
    expect(isPermissionCode("change.validate")).toBe(true);
    expect(isPermissionCode("change.delete")).toBe(false);
    expect(isRoleCode("org_admin")).toBe(true);
    expect(isRoleCode("super_admin")).toBe(false);
  });

  it("checks capabilities rather than role labels", () => {
    expect(can({ permissions: ["corpus.read"] }, "corpus.read")).toBe(true);
    expect(can({ permissions: ["corpus.read"] }, "corpus.write")).toBe(false);
  });
});
