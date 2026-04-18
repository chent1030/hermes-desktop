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

  it("shows labeled workspace metadata, audit status, and hides Gateway nav entry", () => {
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
          audit={{
            health: "degraded",
            queuedEvents: 2,
            droppedEvents: 0,
            lastError: "审计上传失败",
          }}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("租户")).toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("账号")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("当前模型")).toBeInTheDocument();
    expect(screen.getByText("GPT-5.4")).toBeInTheDocument();
    expect(screen.getByText("审计状态")).toBeInTheDocument();
    expect(screen.getByText("已降级")).toBeInTheDocument();
    expect(screen.getByText("审计告警")).toBeInTheDocument();
    expect(screen.getByText("Gateway hidden")).toBeInTheDocument();
    expect(screen.queryByText("Gateway")).not.toBeInTheDocument();
  });
});
