export default {
  title: "设置",
  language: "语言",
  reinitialize: "重新初始化",
  signOut: "退出登录",
  localeNames: {
    en: "英文",
    zhCN: "简体中文",
  },
  account: {
    tenantCode: "租户编码",
  },
  status: {
    initialization: "初始化状态",
    feedback: "初始化反馈",
    audit: "审计状态",
    auditLocal: "本地缓冲状态",
    auditRemote: "平台审计服务状态",
    completed: "已完成",
    readyHint: "租户上下文、模型与 Skill 清单已同步完成。",
    healthy: "正常",
    degraded: "已降级",
    remoteDegraded: "不可达",
    buffering: "缓冲中",
    reauthRequired: "需要重新登录",
    queued: "待补传：{{count}}",
    dropped: "已丢弃：{{count}}",
  },
} as const;
