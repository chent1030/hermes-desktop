import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale as setSharedLocale } from "../../../../shared/i18n";
import { I18nProvider } from "../../components/I18nProvider";
import Chat, { type ChatMessage } from "./Chat";

async function renderLocalizedChat(): Promise<ReturnType<typeof render>> {
  let view: ReturnType<typeof render>;

  function TestHarness(): React.JSX.Element {
    const [messages, setMessages] = useState<ChatMessage[]>([]);

    return (
      <I18nProvider>
        <Chat
          messages={messages}
          setMessages={setMessages}
          sessionId={null}
        />
      </I18nProvider>
    );
  }

  await act(async () => {
    view = render(<TestHarness />);
  });

  return view!;
}

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
        getAppVersion: vi.fn().mockResolvedValue("0.2.2"),
        getHermesVersion: vi.fn().mockResolvedValue("1.0.0"),
        getToolsets: vi.fn().mockResolvedValue([]),
        listModels: vi.fn().mockResolvedValue([]),
        listInstalledSkills: vi.fn().mockResolvedValue([]),
        onChatChunk: vi.fn().mockReturnValue(() => {}),
        onChatDone: vi.fn().mockReturnValue(() => {}),
        onChatError: vi.fn().mockReturnValue(() => {}),
        onChatToolProgress: vi.fn().mockReturnValue(() => {}),
        onChatUsage: vi.fn().mockReturnValue(() => {}),
        readMemory: vi.fn().mockResolvedValue({
          memory: { exists: false, content: "" },
          stats: { totalSessions: 0, totalMessages: 0 },
        }),
        readSoul: vi.fn().mockResolvedValue(""),
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

  it("renders localized slash menu copy and inserts localized prompts", async () => {
    await renderLocalizedChat();

    const input = screen.getByPlaceholderText("输入消息...（Shift+Enter 换行）");
    await act(async () => {
      fireEvent.change(input, { target: { value: "/h" } });
    });

    expect(screen.getByText("命令")).toBeInTheDocument();
    expect(screen.getByText("查看可用命令与帮助")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /搜索网页/i }));
    expect(input).toHaveValue("搜索今天的科技头条新闻");
  });

  it("renders localized local slash command responses in Chinese", async () => {
    await renderLocalizedChat();

    const input = screen.getByPlaceholderText("输入消息...（Shift+Enter 换行）");
    const sendButton = screen.getByTitle("发送");

    await act(async () => {
      fireEvent.change(input, { target: { value: "/help " } });
      fireEvent.click(sendButton);
      await Promise.resolve();
    });

    expect(await screen.findByText("可用命令")).toBeInTheDocument();
    expect(screen.getByText("对话")).toBeInTheDocument();
    expect(
      screen.getAllByText((_, element) =>
        element?.textContent?.includes("切换优先处理模式以降低延迟") ?? false,
      ).length,
    ).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.change(input, { target: { value: "/model " } });
      fireEvent.click(sendButton);
      await Promise.resolve();
    });

    expect(await screen.findByText("当前模型：")).toBeInTheDocument();
    expect(screen.getByText("未设置")).toBeInTheDocument();
    expect(screen.getByText("提供方：")).toBeInTheDocument();
    expect(screen.getAllByText("自动").length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.change(input, { target: { value: "/skills " } });
      fireEvent.click(sendButton);
      await Promise.resolve();
    });
    expect(await screen.findByText("未安装任何技能。")).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(input, { target: { value: "/usage " } });
      fireEvent.click(sendButton);
      await Promise.resolve();
    });
    expect(
      await screen.findByText("暂无用量数据，请先发送一条消息。"),
    ).toBeInTheDocument();
  });
});
