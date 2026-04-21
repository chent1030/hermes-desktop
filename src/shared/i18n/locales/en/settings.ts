export default {
  title: "Settings",
  sections: {
    hermesAgent: "Hermes Agent",
    appearance: "Appearance",
    credentialPool: "Credential Pool",
  },
  theme: {
    label: "Theme",
    system: "System",
    light: "Light",
    dark: "Dark",
  },
  notDetected: "Not detected",
  updatedSuccessfully: "Updated successfully!",
  updateFailed: "Update failed.",
  migrationComplete:
    "Migration complete! Your config, keys, and data have been imported.",
  migrationFailed: "Migration failed.",
  localeNames: {
    en: "English",
    zhCN: "Simplified Chinese",
  },
  account: {
    tenantCode: "Tenant code",
  },
  status: {
    initialization: "Initialization status",
    feedback: "Initialization feedback",
    audit: "Audit status",
    auditLocal: "Local buffering status",
    auditRemote: "Platform audit service status",
    completed: "Completed",
    readyHint: "Tenant context, models, and skill catalog are synchronized.",
    healthy: "Healthy",
    degraded: "Degraded",
    remoteDegraded: "Unavailable",
    buffering: "Buffering",
    reauthRequired: "Reauth required",
    queued: "Queued: {{count}}",
    dropped: "Dropped: {{count}}",
  },
} as const;
