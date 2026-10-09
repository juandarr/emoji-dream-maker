import { afterEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";
import { prepareAccountDatabase, closeAccountDatabase } from "./helpers/account-database";

afterEach(() => { closeAccountDatabase(); vi.unstubAllEnvs(); });
it("reports migrated database readiness and deployment revision without credentials or accounts", async () => {
  await prepareAccountDatabase();
  vi.stubEnv("APP_REVISION", "a".repeat(40));
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, revision: "a".repeat(40) });
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("fails readiness without leaking configuration errors", async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "");
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ ok: false });
});
