import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale as setSharedLocale } from "../../../shared/i18n";
import { I18nProvider } from "../components/I18nProvider";
import Initializing from "./Initializing/Initializing";
import Login from "./Login/Login";
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
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
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
            ]}
            localStates={[
              {
                skillId: "skill-a",
                installed: true,
                version: "0.9.0",
                status: "outdated",
                path: "/tmp/review",
              },
            ]}
            onDownloadSkill={vi.fn()}
          />
          <WorkspaceBanner
            audit={{
              health: "degraded",
              queuedEvents: 2,
              droppedEvents: 1,
              lastError: "服务不可用",
            }}
          />
        </>
      </I18nProvider>,
    );

    expect(screen.getByText("技能")).toBeInTheDocument();
    expect(screen.getByText("版本过期")).toBeInTheDocument();
    expect(screen.getByText("本地 0.9.0 / 平台 1.0.0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下载" })).toBeInTheDocument();
    expect(screen.getByText("审计告警")).toBeInTheDocument();
    expect(screen.getByText("待补传：2")).toBeInTheDocument();
    expect(screen.getByText("已丢弃：1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试审计上传" })).toBeInTheDocument();
  });
});
