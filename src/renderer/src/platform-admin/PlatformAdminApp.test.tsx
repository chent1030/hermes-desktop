import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

function getCardForHeading(name: string): HTMLElement {
  const heading = screen.getByRole("heading", { name });
  const card = heading.closest("article");
  expect(card).not.toBeNull();
  return card as HTMLElement;
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
      mockJsonResponse([
        {
          id: "skill_global_review",
          scopeType: "global",
          tenant: null,
          name: "Code Review",
          version: "1.0.0",
          description: "Review code",
          downloadUrl: "https://example.com/skills/code-review.zip",
          isActive: true,
        },
      ]),
      mockJsonResponse([
        {
          id: 91,
          tenant: {
            id: 7,
            code: "acme",
            name: "Acme Corp",
          },
          account: {
            id: 11,
            username: "alice",
            displayName: "Alice",
            roleCode: "tenant_user",
          },
          eventType: "workspace.initialized",
          payload: {
            modelCount: 1,
          },
          occurredAt: "2026-04-18T12:00:00.000Z",
          createdAt: "2026-04-18T12:00:01.000Z",
        },
      ]),
      mockJsonResponse([
        {
          sessionId: "session-1",
          tenant: {
            id: 7,
            code: "acme",
            name: "Acme Corp",
          },
          lastAccount: {
            id: 11,
            username: "alice",
            displayName: "Alice",
            roleCode: "tenant_user",
          },
          lastEventType: "chat.completed",
          lastOccurredAt: "2026-04-18T12:01:00.000Z",
          eventCount: 2,
          hasFailure: false,
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
    expect(
      screen.getByRole("heading", {
        name: "Skill catalog control",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Audit center",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Session center",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("GPT-5.4")).toBeInTheDocument();
    expect(screen.getByText("Code Review")).toBeInTheDocument();
    expect(screen.getByText("workspace.initialized")).toBeInTheDocument();
    expect(screen.getByText("session-1")).toBeInTheDocument();
    expect(screen.getByText("chat.completed")).toBeInTheDocument();
    expect(screen.getByText("2 events")).toBeInTheDocument();
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
      mockJsonResponse([
        {
          id: "skill_tenant_crm",
          scopeType: "tenant",
          tenant: {
            id: 7,
            code: "acme",
            name: "Acme Corp",
          },
          name: "Acme CRM",
          version: "2.1.0",
          description: "CRM sync",
          downloadUrl: "https://example.com/skills/acme-crm.zip",
          isActive: true,
        },
      ]),
      mockJsonResponse([
        {
          id: 101,
          tenant: {
            id: 7,
            code: "acme",
            name: "Acme Corp",
          },
          account: {
            id: 42,
            username: "admin",
            displayName: "ACME Admin",
            roleCode: "tenant_admin",
          },
          eventType: "chat.started",
          payload: {
            sessionId: "s1",
          },
          occurredAt: "2026-04-18T13:00:00.000Z",
          createdAt: "2026-04-18T13:00:00.500Z",
        },
      ]),
      mockJsonResponse([
        {
          sessionId: "tenant-session-1",
          tenant: {
            id: 7,
            code: "acme",
            name: "Acme Corp",
          },
          lastAccount: {
            id: 42,
            username: "admin",
            displayName: "ACME Admin",
            roleCode: "tenant_admin",
          },
          lastEventType: "chat.failed",
          lastOccurredAt: "2026-04-18T13:01:00.000Z",
          eventCount: 1,
          hasFailure: true,
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
    expect(
      screen.getByRole("heading", {
        name: "Tenant skill catalog",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Tenant audit center",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Tenant session center",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Create tenant admin")).not.toBeInTheDocument();
    expect(screen.queryByText("Global models")).not.toBeInTheDocument();
    expect(screen.queryByText("Global skills")).not.toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("GPT-4.1 Tenant")).toBeInTheDocument();
    expect(screen.getByText("Acme CRM")).toBeInTheDocument();
    expect(screen.getByText("chat.started")).toBeInTheDocument();
    expect(screen.getByText("tenant-session-1")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("applies audit filters with account and payload search, then loads older audit events", async () => {
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
      mockJsonResponse([]),
      mockJsonResponse([
        {
          id: 201,
          tenant: {
            id: 7,
            code: "acme",
            name: "Acme Corp",
          },
          account: {
            id: 11,
            username: "alice",
            displayName: "Alice",
            roleCode: "tenant_user",
          },
          eventType: "workspace.initialized",
          payload: { modelCount: 1 },
          occurredAt: "2026-04-18T12:00:00.000Z",
          createdAt: "2026-04-18T12:00:01.000Z",
        },
      ]),
      mockJsonResponse([
        {
          sessionId: "session-201",
          tenant: {
            id: 7,
            code: "acme",
            name: "Acme Corp",
          },
          lastAccount: {
            id: 11,
            username: "alice",
            displayName: "Alice",
            roleCode: "tenant_user",
          },
          lastEventType: "workspace.initialized",
          lastOccurredAt: "2026-04-18T12:00:00.000Z",
          eventCount: 1,
          hasFailure: false,
        },
      ]),
      mockJsonResponse([
        {
          id: 199,
          tenant: {
            id: 7,
            code: "acme",
            name: "Acme Corp",
          },
          account: {
            id: 11,
            username: "alice",
            displayName: "Alice",
            roleCode: "tenant_user",
          },
          eventType: "chat.started",
          payload: { sessionId: "s1" },
          occurredAt: "2026-04-18T11:00:00.000Z",
          createdAt: "2026-04-18T11:00:00.500Z",
        },
      ]),
      mockJsonResponse([
        {
          id: 188,
          tenant: {
            id: 7,
            code: "acme",
            name: "Acme Corp",
          },
          account: {
            id: 11,
            username: "alice",
            displayName: "Alice",
            roleCode: "tenant_user",
          },
          eventType: "chat.started",
          payload: { sessionId: "s0" },
          occurredAt: "2026-04-18T10:00:00.000Z",
          createdAt: "2026-04-18T10:00:00.500Z",
        },
      ]),
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

    expect(
      await screen.findByRole("heading", { name: "Audit center" }),
    ).toBeInTheDocument();

    const auditCard = getCardForHeading("Audit center");

    fireEvent.change(within(auditCard).getByLabelText("Event type"), {
      target: { value: "chat.started" },
    });
    fireEvent.change(within(auditCard).getByLabelText("Account"), {
      target: { value: "Alice" },
    });
    fireEvent.change(within(auditCard).getByLabelText("Payload contains"), {
      target: { value: "s1" },
    });
    fireEvent.change(within(auditCard).getByLabelText("Limit"), {
      target: { value: "1" },
    });
    fireEvent.click(within(auditCard).getByRole("button", { name: "Apply filters" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "http://127.0.0.1:8080/api/admin/audit/events?tenantId=7&limit=1&eventType=chat.started&accountQuery=Alice&payloadQuery=s1",
        expect.objectContaining({ method: "GET" }),
      );
    });

    expect(await screen.findByText("chat.started")).toBeInTheDocument();
    fireEvent.click(within(auditCard).getByRole("button", { name: "Load older events" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "http://127.0.0.1:8080/api/admin/audit/events?tenantId=7&limit=1&eventType=chat.started&accountQuery=Alice&payloadQuery=s1&beforeId=199",
        expect.objectContaining({ method: "GET" }),
      );
    });

    expect(await screen.findByText("{\"sessionId\":\"s0\"}")).toBeInTheDocument();
  });

  it("applies session filters and loads older sessions", async () => {
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
      mockJsonResponse([]),
      mockJsonResponse([
        {
          id: 201,
          tenant: {
            id: 7,
            code: "acme",
            name: "Acme Corp",
          },
          account: {
            id: 11,
            username: "alice",
            displayName: "Alice",
            roleCode: "tenant_user",
          },
          eventType: "workspace.initialized",
          payload: { modelCount: 1 },
          occurredAt: "2026-04-18T12:00:00.000Z",
          createdAt: "2026-04-18T12:00:01.000Z",
        },
      ]),
      mockJsonResponse([
        {
          sessionId: "session-201",
          tenant: {
            id: 7,
            code: "acme",
            name: "Acme Corp",
          },
          lastAccount: {
            id: 11,
            username: "alice",
            displayName: "Alice",
            roleCode: "tenant_user",
          },
          lastEventType: "workspace.initialized",
          lastOccurredAt: "2026-04-18T12:00:00.000Z",
          eventCount: 1,
          hasFailure: false,
          toolRunCount: 1,
          lastToolLabel: "search_web",
          lastToolSource: "api",
          hasToolFailure: false,
        },
      ]),
      mockJsonResponse([
        {
          sessionId: "session-199",
          tenant: {
            id: 7,
            code: "acme",
            name: "Acme Corp",
          },
          lastAccount: {
            id: 11,
            username: "alice",
            displayName: "Alice",
            roleCode: "tenant_user",
          },
          lastEventType: "chat.failed",
          lastOccurredAt: "2026-04-18T11:00:00.000Z",
          eventCount: 2,
          hasFailure: true,
          toolRunCount: 2,
          lastToolLabel: "apply_patch",
          lastToolSource: "cli",
          hasToolFailure: true,
        },
      ]),
      mockJsonResponse([
        {
          sessionId: "session-188",
          tenant: {
            id: 7,
            code: "acme",
            name: "Acme Corp",
          },
          lastAccount: {
            id: 11,
            username: "alice",
            displayName: "Alice",
            roleCode: "tenant_user",
          },
          lastEventType: "chat.failed",
          lastOccurredAt: "2026-04-18T10:00:00.000Z",
          eventCount: 1,
          hasFailure: true,
          toolRunCount: 0,
          lastToolLabel: null,
          lastToolSource: null,
          hasToolFailure: false,
        },
      ]),
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

    expect(
      await screen.findByRole("heading", { name: "Session center" }),
    ).toBeInTheDocument();

    const sessionCard = getCardForHeading("Session center");

    fireEvent.change(within(sessionCard).getByLabelText("Last event type"), {
      target: { value: "chat.failed" },
    });
    fireEvent.change(within(sessionCard).getByLabelText("Has failure"), {
      target: { value: "true" },
    });
    fireEvent.change(within(sessionCard).getByLabelText("Last occurred from"), {
      target: { value: "2026-04-18T10:00" },
    });
    fireEvent.change(within(sessionCard).getByLabelText("Last occurred to"), {
      target: { value: "2026-04-18T12:00" },
    });
    fireEvent.change(within(sessionCard).getByLabelText("Limit"), {
      target: { value: "1" },
    });
    fireEvent.click(within(sessionCard).getByRole("button", { name: "Apply filters" }));

    expect(await screen.findByText("session-199")).toBeInTheDocument();
    expect(screen.getByText("2 events")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Tools: 2 • Last tool: apply_patch • Source: cli")).toBeInTheDocument();
    expect(screen.getByText("Tool failed")).toBeInTheDocument();

    fireEvent.click(within(sessionCard).getByRole("button", { name: "Load older sessions" }));

    expect(await screen.findByText("session-188")).toBeInTheDocument();
  });

  it("applies event family filters and renders run audit summaries", async () => {
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
      mockJsonResponse([]),
      mockJsonResponse([]),
      mockJsonResponse([]),
      mockJsonResponse([
        {
          id: 301,
          tenant: {
            id: 7,
            code: "acme",
            name: "Acme Corp",
          },
          account: {
            id: 42,
            username: "admin",
            displayName: "ACME Admin",
            roleCode: "tenant_admin",
          },
          eventType: "run.tool.failed",
          payload: {
            source: "cli",
            progressCount: 2,
            lastLabel: "🔍 search_web",
            error: "tool stream interrupted",
          },
          occurredAt: "2026-04-18T13:10:00.000Z",
          createdAt: "2026-04-18T13:10:00.500Z",
        },
      ]),
      mockJsonResponse([]),
      mockJsonResponse([
        {
          id: 302,
          tenant: {
            id: 7,
            code: "acme",
            name: "Acme Corp",
          },
          account: {
            id: 42,
            username: "admin",
            displayName: "ACME Admin",
            roleCode: "tenant_admin",
          },
          eventType: "run.skill.sync.completed",
          payload: {
            installedCount: 1,
            downloadedCount: 2,
            outdatedCount: 0,
            brokenCount: 1,
            notDownloadedCount: 3,
          },
          occurredAt: "2026-04-18T13:11:00.000Z",
          createdAt: "2026-04-18T13:11:00.500Z",
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

    expect(await screen.findByRole("heading", { name: "Tenant audit center" })).toBeInTheDocument();
    expect(screen.getByText("run.tool.failed")).toBeInTheDocument();
    expect(
      screen.getByText("Source: cli • Last label: 🔍 search_web • Progress count: 2"),
    ).toBeInTheDocument();
    expect(screen.getByText("Error: tool stream interrupted")).toBeInTheDocument();

    const auditCard = getCardForHeading("Tenant audit center");
    fireEvent.change(within(auditCard).getByLabelText("Event family"), {
      target: { value: "run." },
    });
    fireEvent.click(within(auditCard).getByRole("button", { name: "Apply filters" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "http://127.0.0.1:8080/api/admin/tenant/audit/events?limit=100&eventPrefix=run.",
        expect.objectContaining({ method: "GET" }),
      );
    });

    expect(await screen.findByText("run.skill.sync.completed")).toBeInTheDocument();
    expect(
      screen.getByText("Installed: 1 • Downloaded: 2 • Broken: 1 • Not downloaded: 3"),
    ).toBeInTheDocument();
  });
});
