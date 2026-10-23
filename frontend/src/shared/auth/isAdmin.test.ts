import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../api/mocks/server";
import { isAdmin } from "./isAdmin";

describe("isAdmin", () => {
  it("reads the administrator flag from the authenticated user endpoint", async () => {
    server.use(
      http.get("http://127.0.0.1:8000/api/v1/auth/me", () =>
        HttpResponse.json({
          id: "user-id",
          email: "owner@example.com",
          username: "owner",
          is_active: true,
          is_admin: true,
        }),
      ),
    );

    await expect(isAdmin("access-token")).resolves.toBe(true);
  });
});
