import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale as setSharedLocale } from "../../../shared/i18n";
import { I18nProvider } from "./I18nProvider";
import ErrorBoundary from "./ErrorBoundary";

function ThrowError(): never {
  throw new Error("测试错误");
}

describe("ErrorBoundary localization", () => {
  beforeEach(() => {
    setSharedLocale("zh-CN");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setSharedLocale("en");
  });

  it("renders the default fallback in Chinese", () => {
    render(
      <I18nProvider>
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      </I18nProvider>,
    );

    expect(screen.getByText("出了点问题")).toBeInTheDocument();
    expect(screen.getByText("测试错误")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });
});
