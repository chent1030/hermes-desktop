import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale as setSharedLocale } from "../../../../shared/i18n";
import { I18nProvider } from "../../components/I18nProvider";
import { PlatformContext } from "../../platform/PlatformProvider";
import Settings from "./Settings";

describe("Settings localization", () => {
  beforeEach(() => {
    setSharedLocale("zh-CN");
  });

  afterEach(() => {
    setSharedLocale("en");
  });

  it("renders localized language options in Chinese", () => {
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
            audit: null,
            initError: null,
            login: vi.fn(),
            refreshSession: vi.fn(),
            retryInitialization: vi.fn(),
            logout: vi.fn(),
            setSelectedModel: vi.fn(),
          }}
        >
          <Settings />
        </PlatformContext.Provider>
      </I18nProvider>,
    );

    expect(screen.getByText("语言")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "英文" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "简体中文" }),
    ).toBeInTheDocument();
  });

  it("switches locale using the localized selector", () => {
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
            audit: null,
            initError: null,
            login: vi.fn(),
            refreshSession: vi.fn(),
            retryInitialization: vi.fn(),
            logout: vi.fn(),
            setSelectedModel: vi.fn(),
          }}
        >
          <Settings />
        </PlatformContext.Provider>
      </I18nProvider>,
    );

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "en" },
    });

    expect(screen.getByRole("option", { name: "English" })).toBeInTheDocument();
  });

  it("shows localized initialization and audit status in Chinese", () => {
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
              queuedEvents: 3,
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
          <Settings />
        </PlatformContext.Provider>
      </I18nProvider>,
    );

    expect(screen.getByText("租户编码")).toBeInTheDocument();
    expect(screen.getByText("acme")).toBeInTheDocument();
    expect(screen.getByText("Alice (alice)")).toBeInTheDocument();
    expect(screen.getByText("当前模型")).toBeInTheDocument();
    expect(screen.getByText("GPT-5.4")).toBeInTheDocument();
    expect(screen.getByText("初始化状态")).toBeInTheDocument();
    expect(screen.getByText("已完成")).toBeInTheDocument();
    expect(screen.getByText("初始化反馈")).toBeInTheDocument();
    expect(
      screen.getByText("租户上下文、模型与 Skill 清单已同步完成。"),
    ).toBeInTheDocument();
    expect(screen.getByText("审计状态")).toBeInTheDocument();
    expect(screen.getByText("已降级")).toBeInTheDocument();
    expect(screen.getByText("本地缓冲状态")).toBeInTheDocument();
    expect(screen.getByText("正常")).toBeInTheDocument();
    expect(screen.getByText("平台审计服务状态")).toBeInTheDocument();
    expect(screen.getByText("不可达")).toBeInTheDocument();
    expect(screen.getByText("待补传：3")).toBeInTheDocument();
    expect(screen.getByText("已丢弃：1")).toBeInTheDocument();
    expect(screen.getByText("审计服务不可用")).toBeInTheDocument();
  });
});
