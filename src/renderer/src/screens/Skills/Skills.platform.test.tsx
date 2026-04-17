import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../components/I18nProvider";
import Skills from "./Skills";

describe("Skills platform catalog", () => {
  it("renders global and tenant skills with local install status and download CTA", () => {
    render(
      <I18nProvider>
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
        />
      </I18nProvider>,
    );

    expect(screen.getByText("Code Review")).toBeInTheDocument();
    expect(screen.getByText("Acme CRM")).toBeInTheDocument();
    expect(screen.getByText("installed")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Download/i })).toHaveLength(2);
  });

  it("shows local version drift and downloaded package path details", () => {
    render(
      <I18nProvider>
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
              name: "Knowledge Base",
              version: "2.1.0",
              description: "Knowledge sync",
              downloadUrl: "https://example.com/b.zip",
            },
          ]}
          localStates={[
            {
              skillId: "skill-a",
              installed: true,
              version: "0.9.0",
              status: "outdated",
              path: "/tmp/review",
            },
            {
              skillId: "skill-b",
              installed: false,
              version: "2.1.0",
              status: "downloaded",
              path: "/Users/demo/Downloads/knowledge-base-2.1.0.zip",
            },
          ]}
          onDownloadSkill={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("Local 0.9.0 / Platform 1.0.0")).toBeInTheDocument();
    expect(
      screen.getByText("/Users/demo/Downloads/knowledge-base-2.1.0.zip"),
    ).toBeInTheDocument();
  });
});
