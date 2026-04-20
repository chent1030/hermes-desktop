import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale as setSharedLocale } from "../../../../shared/i18n";
import { I18nProvider } from "../../components/I18nProvider";
import WorkspaceShell from "./WorkspaceShell";

vi.mock("../Layout/Layout", () => ({
  default: ({ gatewayVisible }: { gatewayVisible?: boolean }) => (
    <div>{gatewayVisible === false ? "Gateway hidden" : "Gateway visible"}</div>
  ),
}));

describe("WorkspaceShell", () => {
  beforeEach(() => {
    setSharedLocale("zh-CN");
  });

  afterEach(() => {
    setSharedLocale("en");
  });

  it("removes the top audit banner and workspace meta strip", () => {
    render(
      <I18nProvider>
        <WorkspaceShell
          workspace={{
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
          }}
        />
      </I18nProvider>,
    );

    expect(screen.queryByText("租户")).not.toBeInTheDocument();
    expect(screen.queryByText("Acme")).not.toBeInTheDocument();
    expect(screen.queryByText("账号")).not.toBeInTheDocument();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    expect(screen.queryByText("当前模型")).not.toBeInTheDocument();
    expect(screen.queryByText("GPT-5.4")).not.toBeInTheDocument();
    expect(screen.queryByText("审计状态")).not.toBeInTheDocument();
    expect(screen.queryByText("已降级")).not.toBeInTheDocument();
    expect(screen.queryByText("审计告警")).not.toBeInTheDocument();
    expect(screen.getByText("Gateway hidden")).toBeInTheDocument();
    expect(screen.queryByText("Gateway")).not.toBeInTheDocument();
  });

  it("still renders the layout when the platform does not provide model profiles", () => {
    render(
      <I18nProvider>
        <WorkspaceShell
          workspace={{
            tenant: { id: "t1", code: "acme", name: "Acme" },
            user: { id: "u1", username: "alice", displayName: "Alice" },
            locale: "zh-CN",
            features: { gatewayVisible: false },
            models: [],
            selectedModelId: "",
            skills: [],
          }}
        />
      </I18nProvider>,
    );

    expect(screen.queryByText("当前模型")).not.toBeInTheDocument();
    expect(screen.queryByText("本地模型配置")).not.toBeInTheDocument();
    expect(screen.getByText("Gateway hidden")).toBeInTheDocument();
  });
});
