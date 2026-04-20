import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale as setSharedLocale } from "../../../../shared/i18n";
import { I18nProvider } from "../../components/I18nProvider";
import { PlatformContext } from "../../platform/PlatformProvider";
import Models from "./Models";

const workspace = {
  tenant: { id: "t1", code: "acme", name: "Acme" },
  user: { id: "u1", username: "alice", displayName: "Alice" },
  locale: "zh-CN" as const,
  features: { gatewayVisible: false },
  models: [
    {
      id: "m-default",
      provider: "openai",
      model: "gpt-5.4",
      label: "GPT-5.4",
      baseUrl: "",
      isDefault: true,
    },
    {
      id: "m-2",
      provider: "anthropic",
      model: "claude-sonnet-4.5",
      label: "Claude Sonnet 4.5",
      baseUrl: "https://api.example.com",
      isDefault: false,
    },
  ],
  selectedModelId: "m-default",
  skills: [],
};

describe("Models localization", () => {
  beforeEach(() => {
    setSharedLocale("zh-CN");
  });

  afterEach(() => {
    setSharedLocale("en");
  });

  it("renders localized platform model copy in Chinese and can switch models", () => {
    const setSelectedModel = vi.fn().mockResolvedValue(undefined);

    render(
      <I18nProvider>
        <PlatformContext.Provider
          value={{
            stage: "workspace",
            workspace,
            audit: null,
            initError: null,
            login: vi.fn(),
            refreshSession: vi.fn(),
            retryInitialization: vi.fn(),
            logout: vi.fn(),
            setSelectedModel,
          }}
        >
          <Models />
        </PlatformContext.Provider>
      </I18nProvider>,
    );

    expect(screen.getByText("模型")).toBeInTheDocument();
    expect(screen.getByText("查看并切换平台授权模型。")).toBeInTheDocument();
    expect(screen.getByText("默认模型")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Claude Sonnet 4.5/i }));
    expect(setSelectedModel).toHaveBeenCalledWith("m-2");
  });
});
