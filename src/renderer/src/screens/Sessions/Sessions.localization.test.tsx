import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale as setSharedLocale } from "../../../../shared/i18n";
import { I18nProvider } from "../../components/I18nProvider";
import Sessions from "./Sessions";

describe("Sessions localization", () => {
  beforeEach(() => {
    setSharedLocale("zh-CN");
  });

  afterEach(() => {
    setSharedLocale("en");
  });

  it("renders localized empty-state copy in Chinese", async () => {
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        listCachedSessions: vi.fn().mockResolvedValue([]),
        syncSessionCache: vi.fn().mockResolvedValue([]),
        searchSessions: vi.fn().mockResolvedValue([]),
      },
    });

    render(
      <I18nProvider>
        <Sessions
          currentSessionId={null}
          onNewChat={vi.fn()}
          onResumeSession={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(await screen.findByText("会话")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /新建聊天/i })).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("搜索会话..."),
    ).toBeInTheDocument();
    expect(await screen.findByText("暂无会话")).toBeInTheDocument();
    expect(screen.getByText("开始聊天后会在这里看到首个会话。")).toBeInTheDocument();
  });

  it("renders localized group labels and message counts in Chinese", async () => {
    const startedAt = Math.floor(Date.now() / 1000);

    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        listCachedSessions: vi.fn().mockResolvedValue([
          {
            id: "s1",
            title: "",
            startedAt,
            source: "desktop",
            messageCount: 2,
            model: "openai/gpt-5.4",
          },
        ]),
        syncSessionCache: vi.fn().mockResolvedValue([
          {
            id: "s1",
            title: "",
            startedAt,
            source: "desktop",
            messageCount: 2,
            model: "openai/gpt-5.4",
          },
        ]),
        searchSessions: vi.fn().mockResolvedValue([]),
      },
    });

    render(
      <I18nProvider>
        <Sessions
          currentSessionId={null}
          onNewChat={vi.fn()}
          onResumeSession={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(await screen.findByText("今天")).toBeInTheDocument();
    expect(screen.getByText("新对话")).toBeInTheDocument();
    expect(screen.getByText("2 条消息")).toBeInTheDocument();
  });
});
