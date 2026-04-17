import { useState } from "react";
import { useI18n } from "../../components/useI18n";
import { usePlatform } from "../../platform/usePlatform";

export default function Login(): React.JSX.Element {
  const { login } = usePlatform();
  const { t } = useI18n();
  const [tenantCode, setTenantCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  return (
    <form
      className="login-screen"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");

        try {
          await login({ tenantCode, username, password });
        } catch (nextError) {
          setError((nextError as Error).message);
        }
      }}
    >
      <label>
        {t("platform.tenant")}
        <input
          value={tenantCode}
          onChange={(event) => setTenantCode(event.target.value)}
        />
      </label>
      <label>
        {t("platform.username")}
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </label>
      <label>
        {t("platform.password")}
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {error && <div className="login-error">{error}</div>}
      <button type="submit">{t("platform.signIn")}</button>
    </form>
  );
}
