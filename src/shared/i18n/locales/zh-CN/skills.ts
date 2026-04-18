export default {
  title: "技能",
  subtitle: "查看平台下发的技能清单和本地状态。",
  manualOnlyHint: "仅提供手动下载，不会自动安装到本机。",
  download: "下载",
  scopeGlobal: "全局",
  scopeTenant: "租户",
  sectionGlobal: "全局技能",
  sectionTenant: "租户技能",
  status: {
    installed: "已安装",
    downloaded: "已下载",
    outdated: "版本过期",
    broken: "本地异常",
    notDownloaded: "未下载",
  },
  localVersion: "本地 {{version}}",
  localVersionDiff: "本地 {{local}} / 平台 {{platform}}",
} as const;
