import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../components/I18nProvider";
import Chat from "./Chat";

describe("Chat platform model picker", () => {
  it("shows only platform-authorized models and hides custom model editing", async () => {
    Element.prototype.scrollIntoView = vi.fn();

    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        abortChat: vi.fn(),
        getConfig: vi.fn().mockResolvedValue(null),
        onChatChunk: vi.fn().mockReturnValue(() => {}),
        onChatDone: vi.fn().mockReturnValue(() => {}),
        onChatError: vi.fn().mockReturnValue(() => {}),
        onChatToolProgress: vi.fn().mockReturnValue(() => {}),
        onChatUsage: vi.fn().mockReturnValue(() => {}),
      },
    });

    render(
      <I18nProvider>
        <Chat
          messages={[]}
          setMessages={vi.fn()}
          sessionId={null}
          platformModels={[
            {
              id: "m1",
              provider: "openai",
              model: "gpt-5.4",
              label: "GPT-5.4",
              baseUrl: "",
              isDefault: true,
            },
          ]}
          selectedModelId="m1"
          onSelectPlatformModel={vi.fn()}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /GPT-5.4/i }));

    expect(screen.getByText("GPT-5.4")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Type model name...")).not.toBeInTheDocument();
  });
});
