import { render, screen } from "@testing-library/react";
import { setLocale as setSharedLocale } from "../../../shared/i18n";
import { I18nProvider } from "./I18nProvider";
import { useI18n } from "./useI18n";

function Probe(): React.JSX.Element {
  const { t } = useI18n();
  return <div>{t("welcome.title")}</div>;
}

describe("I18nProvider", () => {
  it("renders English translations by default", () => {
    setSharedLocale("en");

    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );

    expect(screen.getByText("Welcome to Hermes")).toBeInTheDocument();
  });

  it("renders Chinese translations when locale is zh-CN", () => {
    setSharedLocale("zh-CN");

    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );

    expect(screen.getByText("欢迎使用 Hermes")).toBeInTheDocument();
  });
});
