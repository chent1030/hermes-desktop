export type WorkspaceInitPhase =
  | "idle"
  | "login-complete"
  | "bootstrap"
  | "models"
  | "skills"
  | "completed"
  | "failed";

export interface WorkspaceInitStatus {
  phase: WorkspaceInitPhase;
  lastError: string | null;
  failedPhase: Exclude<
    WorkspaceInitPhase,
    "idle" | "completed" | "failed"
  > | null;
}
