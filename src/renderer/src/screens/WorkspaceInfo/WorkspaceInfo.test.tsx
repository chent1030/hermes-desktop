import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale as setSharedLocale } from "../../../../shared/i18n";
import { I18nProvider } from "../../components/I18nProvider";
import { PlatformContext } from "../../platform/PlatformProvider";
import WorkspaceInfo from "./WorkspaceInfo";

describe("WorkspaceInfo", () => {
  beforeEach(() => {
    setSharedLocale("zh-CN");
  });

  afterEach(() => {
    setSharedLocale("en");
  });

  it("renders workspace identity, status, audit detail, and actions for degraded audit", () => {
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        retryAuditFlush: vi.fn().mockResolvedValue(undefined),
      },
    });

    render(
      <I18nProvider>
        <PlatformContext.Provider
          value={{
            stage: "workspace",
            workspace: {
              tenant: { id: "t1", code: "acme", name: "Acme" },
              user: { id: "u1", username: "alice", displayName: "Alice" },
              locale: "zh-CN",
              features: { gatewayVisible: false },
              models: [
                {
                  id: "m1",
                  provider: "openai",
                  model: "gpt-5.4",
                  label: "GPT-5.4",
                  baseUrl: "",
                  isDefault: true,
                },
              ],
              selectedModelId: "m1",
              skills: [],
            },
            audit: {
              health: "degraded",
              localHealth: "healthy",
              remoteHealth: "degraded",
              queuedEvents: 2,
              droppedEvents: 1,
              lastError: "审计服务不可用",
            },
            initError: null,
            login: vi.fn(),
            refreshSession: vi.fn(),
            retryInitialization: vi.fn(),
            logout: vi.fn(),
            setSelectedModel: vi.fn(),
          }}
        >
          <WorkspaceInfo />
        </PlatformContext.Provider>
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "工作区信息" })).toBeInTheDocument();
    expect(screen.getByText("基本信息")).toBeInTheDocument();
    expect(screen.getByText("工作区状态")).toBeInTheDocument();
    expect(screen.getByText("审计详情")).toBeInTheDocument();
    expect(screen.getByText("会话操作")).toBeInTheDocument();
    expect(screen.getByText("租户编码")).toBeInTheDocument();
    expect(screen.getByText("acme")).toBeInTheDocument();
    expect(screen.getByText("显示名")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("当前模型")).toBeInTheDocument();
    expect(screen.getByText("GPT-5.4")).toBeInTheDocument();
    expect(screen.getByText("本地审计状态")).toBeInTheDocument();
    expect(screen.getByText("平台审计状态")).toBeInTheDocument();
    expect(screen.getByText("待补传：2")).toBeInTheDocument();
    expect(screen.getByText("已丢弃：1")).toBeInTheDocument();
    expect(screen.getByText("审计服务不可用")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新会话" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新初始化" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "退出登录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试审计上传" })).toBeInTheDocument();
  });

  it("hides retry audit upload when audit is healthy", () => {
    render(
      <I18nProvider>
        <PlatformContext.Provider
          value={{
            stage: "workspace",
            workspace: {
              tenant: { id: "t1", code: "acme", name: "Acme" },
              user: { id: "u1", username: "alice", displayName: "Alice" },
              locale: "zh-CN",
              features: { gatewayVisible: false },
              models: [],
              selectedModelId: "",
              skills: [],
            },
            audit: {
              health: "healthy",
              localHealth: "healthy",
              remoteHealth: "healthy",
              queuedEvents: 0,
              droppedEvents: 0,
              lastError: null,
            },
            initError: null,
            login: vi.fn(),
            refreshSession: vi.fn(),
            retryInitialization: vi.fn(),
            logout: vi.fn(),
            setSelectedModel: vi.fn(),
          }}
        >
          <WorkspaceInfo />
        </PlatformContext.Provider>
      </I18nProvider>,
    );

    expect(
      screen.queryByRole("button", { name: "重试审计上传" }),
    ).not.toBeInTheDocument();
  });
});
