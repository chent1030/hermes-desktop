import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale as setSharedLocale } from "../../../../shared/i18n";
import { I18nProvider } from "../../components/I18nProvider";
import { PlatformContext } from "../../platform/PlatformProvider";
import Layout from "./Layout";

vi.mock("../Chat/Chat", () => ({ default: () => <div>Chat Screen</div> }));
vi.mock("../Sessions/Sessions", () => ({ default: () => <div>Sessions Screen</div> }));
vi.mock("../Agents/Agents", () => ({ default: () => <div>Agents Screen</div> }));
vi.mock("../Settings/Settings", () => ({ default: () => <div>Settings Screen</div> }));
vi.mock("../Skills/Skills", () => ({ default: () => <div>Skills Screen</div> }));
vi.mock("../Soul/Soul", () => ({ default: () => <div>Soul Screen</div> }));
vi.mock("../Memory/Memory", () => ({ default: () => <div>Memory Screen</div> }));
vi.mock("../Tools/Tools", () => ({ default: () => <div>Tools Screen</div> }));
vi.mock("../Gateway/Gateway", () => ({ default: () => <div>Gateway Screen</div> }));
vi.mock("../Office/Office", () => ({ default: () => <div>Office Screen</div> }));
vi.mock("../Models/Models", () => ({ default: () => <div>Models Screen</div> }));
vi.mock("../Schedules/Schedules", () => ({ default: () => <div>Schedules Screen</div> }));
vi.mock("../WorkspaceInfo/WorkspaceInfo", () => ({
  default: () => <div>Workspace Info Screen</div>,
}));

describe("Layout localization", () => {
  beforeEach(() => {
    setSharedLocale("zh-CN");
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        onUpdateAvailable: vi.fn().mockReturnValue(() => {}),
        onUpdateDownloadProgress: vi.fn().mockReturnValue(() => {}),
        onUpdateDownloaded: vi.fn().mockReturnValue(() => {}),
        onMenuNewChat: vi.fn().mockReturnValue(() => {}),
        onMenuSearchSessions: vi.fn().mockReturnValue(() => {}),
        abortChat: vi.fn(),
        getSessionMessages: vi.fn().mockResolvedValue([]),
      },
    });
  });

  afterEach(() => {
    setSharedLocale("en");
  });

  it("renders sidebar navigation in Chinese for the platform workspace", () => {
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
            audit: null,
            initError: null,
            login: vi.fn(),
            refreshSession: vi.fn(),
            retryInitialization: vi.fn(),
            logout: vi.fn(),
            setSelectedModel: vi.fn(),
          }}
        >
          <Layout gatewayVisible={false} />
        </PlatformContext.Provider>
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: /聊天/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /办公/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /模型/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /技能/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /工作区信息/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /设置/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /网关/i })).not.toBeInTheDocument();
  });

  it("opens the workspace info screen from the sidebar", () => {
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
          <Layout gatewayVisible={false} />
        </PlatformContext.Provider>
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /工作区信息/i }));
    expect(screen.getByText("Workspace Info Screen")).toBeInTheDocument();
  });

  it("keeps gateway navigation hidden even when gatewayVisible is true", () => {
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        onUpdateAvailable: vi.fn().mockImplementation((callback) => {
          callback({ version: "1.2.3" });
          return () => {};
        }),
        onUpdateDownloadProgress: vi.fn().mockImplementation((callback) => {
          callback({ percent: 42 });
          return () => {};
        }),
        onUpdateDownloaded: vi.fn().mockImplementation((callback) => {
          callback();
          return () => {};
        }),
        onMenuNewChat: vi.fn().mockReturnValue(() => {}),
        onMenuSearchSessions: vi.fn().mockReturnValue(() => {}),
        abortChat: vi.fn(),
        getSessionMessages: vi.fn().mockResolvedValue([]),
        downloadUpdate: vi.fn(),
        installUpdate: vi.fn(),
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
              features: { gatewayVisible: true },
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
            audit: null,
            initError: null,
            login: vi.fn(),
            refreshSession: vi.fn(),
            retryInitialization: vi.fn(),
            logout: vi.fn(),
            setSelectedModel: vi.fn(),
          }}
        >
          <Layout gatewayVisible />
        </PlatformContext.Provider>
      </I18nProvider>,
    );

    expect(screen.queryByRole("button", { name: /网关/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /重启以更新/i })).toBeInTheDocument();
  });
});
