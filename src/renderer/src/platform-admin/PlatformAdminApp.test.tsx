import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../../../../platform-admin/frontend/src/App";

describe("platform admin frontend", () => {
  it("renders the stage-1 admin console shell", () => {
    render(<App />);

    expect(screen.getByText("Hermes Platform Admin")).toBeInTheDocument();
    expect(screen.getByText("Stage 1 Foundation")).toBeInTheDocument();
    expect(screen.getByText("Tenants & RBAC")).toBeInTheDocument();
    expect(screen.getByText("Config Center")).toBeInTheDocument();
    expect(screen.getByText("Skill Hub")).toBeInTheDocument();
    expect(screen.getByText("Audit Center")).toBeInTheDocument();
  });
});
