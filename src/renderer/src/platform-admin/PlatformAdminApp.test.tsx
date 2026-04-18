import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../../../platform-admin/frontend/src/App";

function mockJsonResponse(body: unknown, ok = true, status = 200, statusText = "OK") {
  return {
    ok,
    status,
    statusText,
    json: async () => body,
  } as Response;
}

describe("platform admin frontend", () => {
  beforeEach(() => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "ok",
          service: "platform-admin-backend",
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          accessToken: "atk_demo",
          refreshToken: "rtk_demo",
          tenant: {
            id: 7,
            code: "acme",
            name: "Acme Corp",
          },
          user: {
            id: 42,
            username: "admin",
            displayName: "ACME Admin",
            roleCode: "tenant_admin",
          },
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          accessToken: "atk_rotated",
          refreshToken: "rtk_rotated",
          tenant: {
            id: 7,
            code: "acme",
            name: "Acme Corp",
          },
          user: {
            id: 42,
            username: "admin",
            displayName: "ACME Admin",
            roleCode: "tenant_admin",
          },
        }),
      );

    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the login screen, signs in, and refreshes the session", async () => {
    render(<App />);

    expect(screen.getByText("Hermes Platform Admin")).toBeInTheDocument();
    expect(await screen.findByText("Backend online")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Tenant code"), {
      target: { value: "acme" },
    });
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Signed in as ACME Admin")).toBeInTheDocument();
    expect(screen.getByText("Tenant: Acme Corp (acme)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh session" }));

    expect(await screen.findByText("Session refreshed")).toBeInTheDocument();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:8080/api/health",
      expect.objectContaining({
        method: "GET",
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:8080/api/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          tenantCode: "acme",
          username: "admin",
          password: "secret123",
        }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "http://127.0.0.1:8080/api/auth/refresh",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          refreshToken: "rtk_demo",
        }),
      }),
    );
  });
});
