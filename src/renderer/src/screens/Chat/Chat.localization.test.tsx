import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale as setSharedLocale } from "../../../../shared/i18n";
import { I18nProvider } from "../../components/I18nProvider";
import Chat from "./Chat";

describe("Chat localization", () => {
  beforeEach(() => {
    setSharedLocale("zh-CN");
    Element.prototype.scrollIntoView = vi.fn();

    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        abortChat: vi.fn(),
        getConfig: vi.fn().mockResolvedValue(null),
        getModelConfig: vi.fn().mockResolvedValue({
          provider: "auto",
          model: "",
          baseUrl: "",
        }),
        listModels: vi.fn().mockResolvedValue([]),
        onChatChunk: vi.fn().mockReturnValue(() => {}),
        onChatDone: vi.fn().mockReturnValue(() => {}),
        onChatError: vi.fn().mockReturnValue(() => {}),
        onChatToolProgress: vi.fn().mockReturnValue(() => {}),
        onChatUsage: vi.fn().mockReturnValue(() => {}),
      },
    });
  });

  afterEach(() => {
    setSharedLocale("en");
  });

  it("renders localized empty-state and composer copy in Chinese", () => {
    render(
      <I18nProvider>
        <Chat
          messages={[]}
          setMessages={vi.fn()}
          sessionId={null}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("新对话")).toBeInTheDocument();
    expect(screen.getByText("今天我可以帮你做什么？")).toBeInTheDocument();
    expect(
      screen.getByText("让我帮你写代码、回答问题、搜索网页等。"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("输入消息...（Shift+Enter 换行）"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /搜索网页/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /写脚本/i })).toBeInTheDocument();
  });

  it("renders localized custom model picker copy in Chinese", async () => {
    render(
      <I18nProvider>
        <Chat
          messages={[]}
          setMessages={vi.fn()}
          sessionId={null}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /未设置模型|自动/i }));

    expect(await screen.findByText("自定义")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("输入模型名称...")).toBeInTheDocument();
  });
});
