import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";

interface SpawnRequest {
  executable: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd?: string;
  stdio?: SpawnOptions["stdio"];
  detached?: boolean;
}

export function createProcessRunner(
  deps: { spawnImpl?: typeof spawn } = {},
): {
  spawn: (request: SpawnRequest) => ChildProcess;
} {
  const spawnImpl = deps.spawnImpl ?? spawn;

  return {
    spawn(request: SpawnRequest): ChildProcess {
      return spawnImpl(request.executable, request.args, {
        cwd: request.cwd,
        env: request.env,
        stdio: request.stdio,
        detached: request.detached,
        shell: false,
        windowsHide: true,
      });
    },
  };
}
