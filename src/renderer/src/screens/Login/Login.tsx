import { useState } from "react";
import { usePlatform } from "../../platform/usePlatform";

export default function Login(): React.JSX.Element {
  const { login } = usePlatform();
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
        Tenant
        <input
          value={tenantCode}
          onChange={(event) => setTenantCode(event.target.value)}
        />
      </label>
      <label>
        Username
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {error && <div className="login-error">{error}</div>}
      <button type="submit">Sign in</button>
    </form>
  );
}
