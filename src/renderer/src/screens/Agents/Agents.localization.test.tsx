import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale as setSharedLocale } from "../../../../shared/i18n";
import { I18nProvider } from "../../components/I18nProvider";
import Agents from "./Agents";

describe("Agents localization", () => {
  beforeEach(() => {
    setSharedLocale("zh-CN");
  });

  afterEach(() => {
    setSharedLocale("en");
  });

  it("renders localized page and create-form copy in Chinese", async () => {
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        listProfiles: vi.fn().mockResolvedValue([]),
        createProfile: vi.fn(),
        deleteProfile: vi.fn(),
        setActiveProfile: vi.fn(),
      },
    });

    render(
      <I18nProvider>
        <Agents
          activeProfile="default"
          onChatWith={vi.fn()}
          onSelectProfile={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(await screen.findByText("配置")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /新建配置/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /新建配置/i }));

    expect(screen.getByPlaceholderText("配置名（如 coder）")).toBeInTheDocument();
    expect(screen.getByText("克隆默认配置与 API 密钥")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
  });

  it("renders localized card state copy in Chinese without gateway status", async () => {
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        listProfiles: vi.fn().mockResolvedValue([
          {
            name: "default",
            path: "/tmp/default",
            isDefault: true,
            isActive: true,
            model: "",
            provider: "auto",
            hasEnv: true,
            hasSoul: false,
            skillCount: 2,
            gatewayRunning: false,
          },
          {
            name: "coder",
            path: "/tmp/coder",
            isDefault: false,
            isActive: false,
            model: "openai/gpt-5.4",
            provider: "custom",
            hasEnv: true,
            hasSoul: false,
            skillCount: 1,
            gatewayRunning: true,
          },
        ]),
        createProfile: vi.fn(),
        deleteProfile: vi.fn().mockResolvedValue({ success: true }),
        setActiveProfile: vi.fn(),
      },
    });

    render(
      <I18nProvider>
        <Agents
          activeProfile="default"
          onChatWith={vi.fn()}
          onSelectProfile={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(await screen.findByText("活跃")).toBeInTheDocument();
    expect(screen.getByText("未设置模型")).toBeInTheDocument();
    expect(screen.getByText("2 个技能")).toBeInTheDocument();
    expect(screen.getByText("本地")).toBeInTheDocument();
    expect(screen.queryByText("网关关闭")).not.toBeInTheDocument();
    expect(screen.queryByText("网关运行中")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle("删除配置"));
    expect(screen.getByText("删除？")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "是" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "否" })).toBeInTheDocument();
  });
});
