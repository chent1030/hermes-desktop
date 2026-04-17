import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WorkspaceShell from "./WorkspaceShell";

vi.mock("../Layout/Layout", () => ({
  default: ({ gatewayVisible }: { gatewayVisible?: boolean }) => (
    <div>{gatewayVisible === false ? "Gateway hidden" : "Gateway visible"}</div>
  ),
}));

describe("WorkspaceShell", () => {
  it("shows tenant, user, selected model, and hides Gateway nav entry", () => {
    render(
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
      />,
    );

    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("GPT-5.4")).toBeInTheDocument();
    expect(screen.getByText("Gateway hidden")).toBeInTheDocument();
    expect(screen.queryByText("Gateway")).not.toBeInTheDocument();
  });
});
