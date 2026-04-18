import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale as setSharedLocale } from "../../../shared/i18n";
import { I18nProvider } from "../components/I18nProvider";
import Initializing from "./Initializing/Initializing";
import Login from "./Login/Login";
import SessionRecovery from "./SessionRecovery/SessionRecovery";
import Skills from "./Skills/Skills";
import WorkspaceBanner from "./Workspace/WorkspaceBanner";
import { PlatformContext } from "../platform/PlatformProvider";

describe("platform screen localization", () => {
  beforeEach(() => {
    setSharedLocale("zh-CN");
  });

  afterEach(() => {
    setSharedLocale("en");
  });

  it("renders localized login and initializing copy in Chinese", () => {
    render(
      <I18nProvider>
        <PlatformContext.Provider
          value={{
            stage: "login",
            workspace: null,
            audit: null,
            initError: "初始化失败",
            login: vi.fn(),
            retryInitialization: vi.fn(),
            logout: vi.fn(),
            setSelectedModel: vi.fn(),
          }}
        >
          <>
            <Login />
            <Initializing />
          </>
        </PlatformContext.Provider>
      </I18nProvider>,
    );

    expect(screen.getByLabelText("租户")).toBeInTheDocument();
    expect(screen.getByLabelText("账号")).toBeInTheDocument();
    expect(screen.getByLabelText("密码")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(screen.getByText("正在初始化工作区")).toBeInTheDocument();
    expect(
      screen.getByText("正在加载租户上下文、模型和 Skill 清单..."),
    ).toBeInTheDocument();
    expect(screen.getByText("失败阶段：初始化")).toBeInTheDocument();
    expect(
      screen.getByText("工作区初始化失败，请检查平台服务状态后重试。"),
    ).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => element?.textContent === "原始错误: 初始化失败"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });

  it("renders localized staged initialization guidance in Chinese", () => {
    render(
      <I18nProvider>
        <PlatformContext.Provider
          value={{
            stage: "initializing",
            workspace: null,
            audit: null,
            initError: "platform default model missing",
            login: vi.fn(),
            retryInitialization: vi.fn(),
            logout: vi.fn(),
            setSelectedModel: vi.fn(),
          }}
        >
          <Initializing />
        </PlatformContext.Provider>
      </I18nProvider>,
    );

    expect(screen.getByText("失败阶段：模型配置")).toBeInTheDocument();
    expect(
      screen.getByText(
        "平台未下发可用默认模型，请联系租户管理员或超级管理员检查授权模型与默认模型配置。",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/platform default model missing/i)).toBeInTheDocument();
  });

  it("renders localized init progress labels in Chinese", () => {
    render(
      <I18nProvider>
        <PlatformContext.Provider
          value={{
            stage: "initializing",
            workspace: null,
            audit: null,
            initError: null,
            initStatus: {
              phase: "skills",
              failedPhase: null,
              lastError: null,
            },
            login: vi.fn(),
            retryInitialization: vi.fn(),
            logout: vi.fn(),
            setSelectedModel: vi.fn(),
          }}
        >
          <Initializing />
        </PlatformContext.Provider>
      </I18nProvider>,
    );

    expect(screen.getByText("登录完成")).toBeInTheDocument();
    expect(screen.getByText("平台上下文")).toBeInTheDocument();
    expect(screen.getByText("模型配置")).toBeInTheDocument();
    expect(screen.getByText("Skill 清单")).toBeInTheDocument();
    expect(screen.getByText("进行中")).toBeInTheDocument();
  });

  it("renders localized skill statuses and audit banner copy in Chinese", () => {
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        retryAuditFlush: vi.fn().mockResolvedValue(undefined),
      },
    });

    render(
      <I18nProvider>
        <>
          <Skills
            catalog={[
              {
                id: "skill-a",
                scope: "global",
                name: "Code Review",
                version: "1.0.0",
                description: "Review code",
                downloadUrl: "https://example.com/a.zip",
              },
              {
                id: "skill-b",
                scope: "tenant",
                name: "Acme CRM",
                version: "1.1.0",
                description: "CRM sync",
                downloadUrl: "https://example.com/b.zip",
              },
            ]}
            localStates={[
              {
                skillId: "skill-a",
                installed: true,
                version: "0.9.0",
                status: "outdated",
                path: "/tmp/review",
              },
              {
                skillId: "skill-b",
                installed: false,
                version: null,
                status: "not-downloaded",
                path: null,
              },
            ]}
            onDownloadSkill={vi.fn()}
          />
          <WorkspaceBanner
            audit={{
              health: "degraded",
              localHealth: "healthy",
              remoteHealth: "degraded",
              queuedEvents: 2,
              droppedEvents: 1,
              lastError: "服务不可用",
            }}
          />
        </>
      </I18nProvider>,
    );

    expect(screen.getByText("技能")).toBeInTheDocument();
    expect(screen.getByText("全局技能")).toBeInTheDocument();
    expect(screen.getByText("租户技能")).toBeInTheDocument();
    expect(screen.getByText("版本过期")).toBeInTheDocument();
    expect(screen.getByText("本地 0.9.0 / 平台 1.0.0")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "下载" })).toHaveLength(2);
    expect(screen.getByText("审计告警")).toBeInTheDocument();
    expect(screen.getByText("待补传：2")).toBeInTheDocument();
    expect(screen.getByText("已丢弃：1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试审计上传" })).toBeInTheDocument();
  });

  it("renders localized session recovery copy in Chinese", () => {
    render(
      <I18nProvider>
        <PlatformContext.Provider
          value={{
            stage: "session-recovery",
            workspace: null,
            audit: null,
            initError: null,
            sessionRecoveryReason: "refresh token expired",
            login: vi.fn(),
            retryInitialization: vi.fn(),
            logout: vi.fn(),
            setSelectedModel: vi.fn(),
          }}
        >
          <SessionRecovery />
        </PlatformContext.Provider>
      </I18nProvider>,
    );

    expect(screen.getByText("正在恢复会话")).toBeInTheDocument();
    expect(
      screen.getByText("平台会话已失效，桌面端正在清理内存中的工作区状态。"),
    ).toBeInTheDocument();
    expect(screen.getByText("即将返回登录页...")).toBeInTheDocument();
    expect(screen.getByText("原因: refresh token expired")).toBeInTheDocument();
  });
});
