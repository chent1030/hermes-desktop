export default {
  title: "设置",
  account: "账户",
  language: "语言",
  reinitialize: "重新初始化",
  signOut: "退出登录",
  localeNames: {
    en: "英文",
    zhCN: "简体中文",
  },
  status: {
    initialization: "初始化状态",
    audit: "审计状态",
    completed: "已完成",
    healthy: "正常",
    degraded: "已降级",
    buffering: "缓冲中",
    reauthRequired: "需要重新登录",
    queued: "待补传：{{count}}",
    dropped: "已丢弃：{{count}}",
  },
} as const;
