import { useState } from "react";
import { ArrowRight } from "lucide-react";
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
    <div className="relative flex min-h-full flex-1 overflow-hidden bg-[#03060d] text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.2),_transparent_36%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.16),_transparent_28%),linear-gradient(135deg,_rgba(15,23,42,0.98),_rgba(2,6,23,1))]" />
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)",
          backgroundSize: "52px 52px",
          maskImage:
            "radial-gradient(circle at center, black 22%, transparent 85%)",
        }}
      />
      <div className="absolute inset-x-0 top-24 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent motion-safe:animate-pulse" />
      <div className="relative mx-auto flex min-h-full w-full max-w-7xl items-center px-4 py-5 sm:px-6 lg:px-10">
        <div className="grid w-full overflow-hidden rounded-[30px] border border-white/10 bg-slate-950/72 shadow-[0_28px_120px_rgba(2,6,23,0.85)] backdrop-blur-xl lg:grid-cols-[1.05fr_0.95fr]">
          <section className="relative hidden min-h-[640px] overflow-hidden border-r border-white/10 lg:block">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_30%,rgba(34,211,238,0.24),transparent_0,transparent_24%),radial-gradient(circle_at_65%_58%,rgba(14,165,233,0.18),transparent_0,transparent_32%),linear-gradient(180deg,rgba(2,6,23,0.82),rgba(2,6,23,0.96))]" />
            <div className="absolute inset-10 rounded-[28px] border border-white/8 bg-white/[0.02]" />
            <div
              aria-hidden="true"
              className="absolute inset-10 rounded-[28px] opacity-60"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)",
                backgroundSize: "44px 44px",
              }}
            />
            <div className="absolute left-14 top-14 h-40 w-40 rounded-full border border-cyan-300/20 bg-cyan-300/10 blur-3xl" />
            <div className="absolute bottom-16 right-18 h-56 w-56 rounded-full border border-sky-300/10 bg-sky-300/10 blur-3xl" />
            <div className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/12" />
            <div className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/18" />
            <div className="absolute left-1/2 top-1/2 h-[180px] w-[180px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/30 bg-cyan-300/8 shadow-[0_0_60px_rgba(34,211,238,0.18)]" />

            <div className="relative z-10 flex h-full flex-col justify-between p-12">
              <div className="inline-flex w-fit items-center gap-3 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan-100">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.95)]" />
                {t("platform.loginEyebrow")}
              </div>

              <div className="max-w-xl space-y-5">
                <h1 className="text-5xl font-semibold leading-[1.08] text-white">
                  {t("platform.loginHeadline")}
                </h1>
                <p className="max-w-md text-base leading-8 text-slate-300">
                  {t("platform.loginDescription")}
                </p>
              </div>

              <div className="flex items-center gap-3 text-sm text-slate-400">
                <span className="h-px w-16 bg-gradient-to-r from-cyan-300/80 to-transparent" />
                <span>{t("platform.loginStatusValue")}</span>
              </div>
            </div>
          </section>

          <section className="relative flex items-center bg-[radial-gradient(circle_at_top,_rgba(8,145,178,0.14),_transparent_24%),linear-gradient(180deg,_rgba(2,6,23,0.9),_rgba(2,6,23,0.96))] p-5 sm:p-8 lg:p-10">
            <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />
            <div className="w-full rounded-[28px] border border-white/10 bg-black/30 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.75)] backdrop-blur-md sm:p-8 lg:mx-auto lg:max-w-xl">
              <div className="mb-8 space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium tracking-[0.24em] text-cyan-100/85">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.9)]" />
                  {t("platform.loginPanelEyebrow")}
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold text-white">{t("platform.loginTitle")}</h2>
                  <p className="max-w-md text-sm leading-6 text-slate-300">
                    {t("platform.loginPanelHint")}
                  </p>
                </div>
              </div>

              <form
                className="space-y-5"
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
                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-400">
                    {t("platform.tenant")}
                  </span>
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition duration-200 placeholder:text-slate-500 focus:border-cyan-300/60 focus:bg-white/[0.06] focus:shadow-[0_0_0_4px_rgba(34,211,238,0.12)]"
                    value={tenantCode}
                    autoComplete="organization"
                    placeholder="acme"
                    onChange={(event) => setTenantCode(event.target.value)}
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-400">
                    {t("platform.username")}
                  </span>
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition duration-200 placeholder:text-slate-500 focus:border-cyan-300/60 focus:bg-white/[0.06] focus:shadow-[0_0_0_4px_rgba(34,211,238,0.12)]"
                    value={username}
                    autoComplete="username"
                    placeholder="alice"
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-400">
                    {t("platform.password")}
                  </span>
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition duration-200 placeholder:text-slate-500 focus:border-cyan-300/60 focus:bg-white/[0.06] focus:shadow-[0_0_0_4px_rgba(34,211,238,0.12)]"
                    type="password"
                    value={password}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>

                {error ? (
                  <div
                    role="alert"
                    className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
                  >
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  className="group flex w-full cursor-pointer items-center justify-between rounded-2xl border border-cyan-300/25 bg-[linear-gradient(135deg,#0f172a,#0f3b56_55%,#06b6d4)] px-5 py-4 text-left text-white transition duration-200 hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-cyan-300/20 motion-reduce:transition-none"
                >
                  <span className="space-y-1">
                    <span
                      aria-hidden="true"
                      className="block text-[11px] uppercase tracking-[0.3em] text-cyan-100/80"
                    >
                      {t("platform.loginSubmitEyebrow")}
                    </span>
                    <span className="block text-base font-semibold">{t("platform.signIn")}</span>
                  </span>
                  <span className="rounded-full border border-white/15 bg-white/10 p-2 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transform-none">
                    <ArrowRight className="h-5 w-5" />
                  </span>
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
