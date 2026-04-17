import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Skills from "./Skills";

describe("Skills platform catalog", () => {
  it("renders global and tenant skills with local install status and download CTA", () => {
    render(
      <Skills
        catalog={[
          {
            id: "skill-a",
            scope: "global",
            name: "Code Review",
            version: "1.0.0",
            description: "Review code",
            downloadUrl: "https://example.com/a.zip",
          },
          {
            id: "skill-b",
            scope: "tenant",
            name: "Acme CRM",
            version: "2.1.0",
            description: "CRM sync",
            downloadUrl: "https://example.com/b.zip",
          },
        ]}
        localStates={[
          {
            skillId: "skill-a",
            installed: true,
            version: "1.0.0",
            status: "installed",
            path: "/tmp/a",
          },
          {
            skillId: "skill-b",
            installed: false,
            version: null,
            status: "not-downloaded",
            path: null,
          },
        ]}
        onDownloadSkill={vi.fn()}
      />,
    );

    expect(screen.getByText("Code Review")).toBeInTheDocument();
    expect(screen.getByText("Acme CRM")).toBeInTheDocument();
    expect(screen.getByText("installed")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Download/i })).toHaveLength(2);
  });
});
