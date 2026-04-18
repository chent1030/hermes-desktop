import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../../../../platform-admin/frontend/src/App";

function mockJsonResponse(body: unknown, ok = true, status = 200, statusText = "OK") {
  return {
    ok,
    status,
    statusText,
    json: async () => body,
  } as Response;
}

function setupFetch(responses: Response[]): void {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() => responses.shift()));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("platform admin frontend", () => {
  it("renders a super admin workspace with tenant creation after login and refresh", async () => {
    setupFetch([
      mockJsonResponse({ status: "ok", service: "platform-admin-backend" }),
      mockJsonResponse({
        accessToken: "atk_root",
        refreshToken: "rtk_root",
        tenant: null,
        user: {
          id: 1,
          username: "root",
          displayName: "Platform Root",
          roleCode: "super_admin",
          scopeType: "platform",
        },
      }),
      mockJsonResponse([
        {
          id: 7,
          code: "acme",
          name: "Acme Corp",
          isActive: true,
        },
      ]),
      mockJsonResponse([
        {
          id: 11,
          scopeType: "tenant",
          tenant: {
            id: 7,
            code: "acme",
            name: "Acme Corp",
          },
          username: "alice",
          displayName: "Alice",
          roleCode: "tenant_user",
          isActive: true,
        },
      ]),
      mockJsonResponse([
        {
          id: "mdl_global_default",
          scopeType: "global",
          tenant: null,
          provider: "openai",
          model: "gpt-5.4",
          label: "GPT-5.4",
          baseUrl: "https://api.openai.com/v1",
          isDefault: true,
          isActive: true,
        },
      ]),
      mockJsonResponse({
        accessToken: "atk_root_rotated",
        refreshToken: "rtk_root_rotated",
        tenant: null,
        user: {
          id: 1,
          username: "root",
          displayName: "Platform Root",
          roleCode: "super_admin",
          scopeType: "platform",
        },
      }),
    ]);

    render(<App />);

    expect(await screen.findByText("Backend online")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tenant code"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "root" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "Secret123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Platform workspace")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Create tenant",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Model profile control",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("GPT-5.4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh session" }));
    expect(await screen.findByText("Session refreshed")).toBeInTheDocument();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "http://127.0.0.1:8080/api/admin/tenants",
        expect.objectContaining({ method: "GET" }),
      );
    });
  });

  it("renders a tenant admin workspace without tenant-admin creation controls", async () => {
    setupFetch([
      mockJsonResponse({ status: "ok", service: "platform-admin-backend" }),
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
          scopeType: "tenant",
        },
      }),
      mockJsonResponse([
        {
          id: 11,
          scopeType: "tenant",
          tenant: {
            id: 7,
            code: "acme",
            name: "Acme Corp",
          },
          username: "alice",
          displayName: "Alice",
          roleCode: "tenant_user",
          isActive: true,
        },
      ]),
      mockJsonResponse([
        {
          id: "mdl_tenant_default",
          scopeType: "tenant",
          tenant: {
            id: 7,
            code: "acme",
            name: "Acme Corp",
          },
          provider: "openai",
          model: "gpt-4.1",
          label: "GPT-4.1 Tenant",
          baseUrl: "https://api.openai.com/v1",
          isDefault: true,
          isActive: true,
        },
      ]),
    ]);

    render(<App />);

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

    expect(await screen.findByText("Tenant workspace")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Create tenant user",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Tenant model profiles",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Create tenant admin")).not.toBeInTheDocument();
    expect(screen.queryByText("Global models")).not.toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("GPT-4.1 Tenant")).toBeInTheDocument();
  });
});
