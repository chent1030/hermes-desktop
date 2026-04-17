import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale as setSharedLocale } from "../../../shared/i18n";
import { I18nProvider } from "./I18nProvider";
import AgentMarkdown from "./AgentMarkdown";

describe("AgentMarkdown localization", () => {
  beforeEach(() => {
    setSharedLocale("zh-CN");
    vi.useFakeTimers();

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    setSharedLocale("en");
  });

  it("shows localized copied state in Chinese", () => {
    render(
      <I18nProvider>
        <AgentMarkdown>
          {"```ts\nconsole.log('hello')\n```"}
        </AgentMarkdown>
      </I18nProvider>,
    );

    const copyButton = screen.getByRole("button");
    act(() => {
      fireEvent.click(copyButton);
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "console.log('hello')",
    );
    expect(screen.getByRole("button", { name: "已复制" })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole("button", { name: "复制" })).toBeInTheDocument();
  });
});
