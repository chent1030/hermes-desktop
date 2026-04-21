import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import icon from "../../assets/icon.png";
import { AgentMarkdown } from "../../components/AgentMarkdown";
import { useI18n } from "../../components/useI18n";
import {
  Trash2 as Trash,
  Send,
  Square as Stop,
  Plus,
  ChevronDown,
  Search,
  Clock,
  Mail,
  Code,
  ChartLine,
  Bell,
  Slash,
  Zap,
} from "lucide-react";
import type { WorkspaceModel } from "../../../../shared/platform/contracts";

// ── Slash Commands ──────────────────────────────────────

interface SlashCommand {
  name: string;
  descriptionKey: string;
  category: "chat" | "agent" | "tools" | "info";
  /** If true, the command is handled locally instead of sent to the backend */
  local?: boolean;
}

const SLASH_COMMANDS: SlashCommand[] = [
  // Chat control
  {
    name: "/new",
    descriptionKey: "chat.commands.new",
    category: "chat",
    local: true,
  },
  {
    name: "/clear",
    descriptionKey: "chat.commands.clear",
    category: "chat",
    local: true,
  },
  // Agent commands (sent to backend)
  {
    name: "/btw",
    descriptionKey: "chat.commands.btw",
    category: "agent",
  },
  {
    name: "/approve",
    descriptionKey: "chat.commands.approve",
    category: "agent",
  },
  { name: "/deny", descriptionKey: "chat.commands.deny", category: "agent" },
  {
    name: "/status",
    descriptionKey: "chat.commands.status",
    category: "agent",
  },
  {
    name: "/reset",
    descriptionKey: "chat.commands.reset",
    category: "agent",
  },
  {
    name: "/compact",
    descriptionKey: "chat.commands.compact",
    category: "agent",
  },
  { name: "/undo", descriptionKey: "chat.commands.undo", category: "agent" },
  {
    name: "/retry",
    descriptionKey: "chat.commands.retry",
    category: "agent",
  },
  {
    name: "/fast",
    descriptionKey: "chat.commands.fast",
    category: "agent",
    local: true,
  },
  {
    name: "/compress",
    descriptionKey: "chat.commands.compress",
    category: "agent",
  },
  {
    name: "/usage",
    descriptionKey: "chat.commands.usage",
    category: "agent",
    local: true,
  },
  {
    name: "/debug",
    descriptionKey: "chat.commands.debug",
    category: "agent",
  },
  // Tools & capabilities
  { name: "/web", descriptionKey: "chat.commands.web", category: "tools" },
  {
    name: "/image",
    descriptionKey: "chat.commands.image",
    category: "tools",
  },
  {
    name: "/browse",
    descriptionKey: "chat.commands.browse",
    category: "tools",
  },
  { name: "/code", descriptionKey: "chat.commands.code", category: "tools" },
  { name: "/file", descriptionKey: "chat.commands.file", category: "tools" },
  {
    name: "/shell",
    descriptionKey: "chat.commands.shell",
    category: "tools",
  },
  // Info
  {
    name: "/help",
    descriptionKey: "chat.commands.help",
    category: "info",
  },
  { name: "/tools", descriptionKey: "chat.commands.tools", category: "info" },
  {
    name: "/skills",
    descriptionKey: "chat.commands.skills",
    category: "info",
  },
  {
    name: "/model",
    descriptionKey: "chat.commands.model",
    category: "info",
  },
  {
    name: "/memory",
    descriptionKey: "chat.commands.memory",
    category: "info",
  },
  {
    name: "/persona",
    descriptionKey: "chat.commands.persona",
    category: "info",
  },
  {
    name: "/version",
    descriptionKey: "chat.commands.version",
    category: "info",
  },
];

function HermesAvatar({ size = 30 }: { size?: number }): React.JSX.Element {
  return (
    <div className="chat-avatar chat-avatar-agent">
      <img src={icon} width={size} height={size} alt="" />
    </div>
  );
}

export { AgentMarkdown };

const APPROVAL_RE =
  /⚠️.*dangerous|requires? (your )?approval|\/approve.*\/deny|do you want (me )?to (proceed|continue|run|execute)/i;

interface MessageRowProps {
  msg: ChatMessage;
  isLast: boolean;
  isLoading: boolean;
  onApprove: () => void;
  onDeny: () => void;
  approveLabel: string;
  denyLabel: string;
}

const MessageRow = memo(function MessageRow({
  msg,
  isLast,
  isLoading,
  onApprove,
  onDeny,
  approveLabel,
  denyLabel,
}: MessageRowProps): React.JSX.Element {
  return (
    <div className={`chat-message chat-message-${msg.role}`}>
      {msg.role === "user" ? (
        <div className="chat-avatar chat-avatar-user">U</div>
      ) : (
        <HermesAvatar />
      )}
      <div className={`chat-bubble chat-bubble-${msg.role}`}>
        {msg.role === "agent" ? (
          <AgentMarkdown>{msg.content}</AgentMarkdown>
        ) : (
          msg.content
        )}
      </div>
      {msg.role === "agent" &&
        !isLoading &&
        isLast &&
        APPROVAL_RE.test(msg.content) && (
          <div className="chat-approval-bar">
            <button
              className="chat-approval-btn chat-approve"
              onClick={onApprove}
            >
              {approveLabel}
            </button>
            <button className="chat-approval-btn chat-deny" onClick={onDeny}>
              {denyLabel}
            </button>
          </div>
        )}
    </div>
  );
});

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
}

interface ModelGroup {
  provider: string;
  providerLabel: string;
  models: Array<{
    id?: string;
    provider: string;
    model: string;
    label: string;
    baseUrl: string;
  }>;
}

import { PROVIDERS } from "../../constants";

interface ChatProps {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  sessionId: string | null;
  profile?: string;
  onSessionStarted?: () => void;
  onNewChat?: () => void;
  platformModels?: WorkspaceModel[];
  selectedModelId?: string;
  onSelectPlatformModel?: (modelId: string) => Promise<void>;
}

function Chat({
  messages,
  setMessages,
  sessionId,
  profile,
  onSessionStarted,
  onNewChat,
  platformModels,
  selectedModelId,
  onSelectPlatformModel,
}: ChatProps): React.JSX.Element {
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hermesSessionId, setHermesSessionId] = useState<string | null>(null);
  const [toolProgress, setToolProgress] = useState<string | null>(null);
  const [usage, setUsage] = useState<{
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost?: number;
  } | null>(null);
  const [fastMode, setFastMode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isLoadingRef = useRef(false);
  const userScrolledUpRef = useRef(false);

  // Model picker state
  const [currentModel, setCurrentModel] = useState("");
  const [currentProvider, setCurrentProvider] = useState("auto");
  const [currentBaseUrl, setCurrentBaseUrl] = useState("");
  const [modelGroups, setModelGroups] = useState<ModelGroup[]>([]);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [customModelInput, setCustomModelInput] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  const hasPlatformModels =
    Boolean(platformModels?.length) &&
    Boolean(selectedModelId) &&
    Boolean(onSelectPlatformModel);

  // Slash command menu state
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const slashMenuRef = useRef<HTMLDivElement>(null);
  const slashCommands = useMemo(
    () =>
      SLASH_COMMANDS.map((cmd) => ({
        ...cmd,
        description: t(cmd.descriptionKey),
      })),
    [t],
  );

  // Keep ref in sync for use in IPC callbacks
  isLoadingRef.current = isLoading;

  // Filtered slash commands based on current input
  const filteredSlashCommands = useMemo(
    () =>
      slashMenuOpen
        ? slashCommands.filter((cmd) =>
            cmd.name.toLowerCase().startsWith(slashFilter.toLowerCase()),
          )
        : [],
    [slashCommands, slashMenuOpen, slashFilter],
  );

  const scrollToBottom = useCallback((force?: boolean) => {
    if (!force && userScrolledUpRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Track whether the user has scrolled away from the bottom
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    function handleScroll(): void {
      const el = container!;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      userScrolledUpRef.current = !atBottom;
    }
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Reset hermes session when messages are cleared (new chat)
  useEffect(() => {
    if (messages.length === 0) {
      setHermesSessionId(null);
    }
  }, [messages]);

  const loadModelConfig = useCallback(async (): Promise<void> => {
    if (hasPlatformModels) {
      const selectedPlatformModel = platformModels!.find(
        (item) => item.id === selectedModelId,
      );

      setCurrentModel(selectedPlatformModel?.model || "");
      setCurrentProvider(selectedPlatformModel?.provider || "auto");
      setCurrentBaseUrl(selectedPlatformModel?.baseUrl || "");

      const groupMap = new Map<string, ModelGroup>();
      for (const model of platformModels || []) {
        if (!groupMap.has(model.provider)) {
          groupMap.set(model.provider, {
            provider: model.provider,
            providerLabel: PROVIDERS.labels[model.provider] || model.provider,
            models: [],
          });
        }
        groupMap.get(model.provider)!.models.push({
          id: model.id,
          provider: model.provider,
          model: model.model,
          label: model.label,
          baseUrl: model.baseUrl || "",
        });
      }
      setModelGroups(Array.from(groupMap.values()));
      return;
    }

    const [mc, savedModels] = await Promise.all([
      window.hermesAPI.getModelConfig(profile),
      window.hermesAPI.listModels(),
    ]);
    setCurrentModel(mc.model);
    setCurrentProvider(mc.provider);
    setCurrentBaseUrl(mc.baseUrl);

    // Group saved models by provider
    const groupMap = new Map<string, ModelGroup>();
    for (const m of savedModels) {
      if (!groupMap.has(m.provider)) {
        groupMap.set(m.provider, {
          provider: m.provider,
          providerLabel: PROVIDERS.labels[m.provider] || m.provider,
          models: [],
        });
      }
      groupMap.get(m.provider)!.models.push({
        provider: m.provider,
        model: m.model,
        label: m.name,
        baseUrl: m.baseUrl || "",
      });
    }
    setModelGroups(Array.from(groupMap.values()));
  }, [hasPlatformModels, platformModels, profile, selectedModelId]);

  // Load model config and build available models list
  useEffect(() => {
    loadModelConfig();
  }, [loadModelConfig]);

  // Load fast mode state from config
  useEffect(() => {
    window.hermesAPI.getConfig("agent.service_tier", profile).then((val) => {
      setFastMode(val === "fast" || val === "priority");
    });
  }, [profile]);

  // Close picker on click outside
  useEffect(() => {
    if (!showModelPicker) return;
    function handleClickOutside(e: MouseEvent): void {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showModelPicker]);

  // Close slash menu on click outside
  useEffect(() => {
    if (!slashMenuOpen) return;
    function handleClickOutside(e: MouseEvent): void {
      if (
        slashMenuRef.current &&
        !slashMenuRef.current.contains(e.target as Node)
      ) {
        setSlashMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [slashMenuOpen]);

  // Scroll active slash menu item into view
  useEffect(() => {
    if (!slashMenuOpen) return;
    const active = slashMenuRef.current?.querySelector(
      ".slash-menu-item-active",
    );
    active?.scrollIntoView({ block: "nearest" });
  }, [slashSelectedIndex, slashMenuOpen]);

  async function selectModel(
    provider: string,
    model: string,
    baseUrl: string,
    modelId?: string,
  ): Promise<void> {
    if (hasPlatformModels && modelId && onSelectPlatformModel) {
      await onSelectPlatformModel(modelId);
      setCurrentModel(model);
      setCurrentProvider(provider);
      setCurrentBaseUrl(baseUrl);
      setShowModelPicker(false);
      return;
    }

    await window.hermesAPI.setModelConfig(provider, model, baseUrl, profile);
    setCurrentModel(model);
    setCurrentProvider(provider);
    setCurrentBaseUrl(baseUrl);
    setShowModelPicker(false);
    setCustomModelInput("");
  }

  async function handleCustomModelSubmit(): Promise<void> {
    if (hasPlatformModels) return;
    const model = customModelInput.trim();
    if (!model) return;
    await selectModel(
      currentProvider === "auto" ? "auto" : currentProvider,
      model,
      currentBaseUrl,
    );
  }

  // IPC listeners — stable callback refs, registered once
  useEffect(() => {
    const cleanupChunk = window.hermesAPI.onChatChunk((chunk) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        // Append to existing agent message
        if (last && last.role === "agent") {
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + chunk },
          ];
        }
        // Only create a new message if chunk has visible content
        if (!chunk || !chunk.trim()) return prev;
        return [
          ...prev,
          { id: `agent-${Date.now()}`, role: "agent", content: chunk },
        ];
      });
    });

    const cleanupDone = window.hermesAPI.onChatDone((sessionId) => {
      if (sessionId) setHermesSessionId(sessionId);
      setToolProgress(null);
      setIsLoading(false);
    });

    const cleanupError = window.hermesAPI.onChatError((error) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "agent",
          content: `${t("chat.errorPrefix")}: ${error}`,
        },
      ]);
      setToolProgress(null);
      setIsLoading(false);
    });

    const cleanupToolProgress = window.hermesAPI.onChatToolProgress((tool) => {
      setToolProgress(tool);
    });

    const cleanupUsage = window.hermesAPI.onChatUsage((u) => {
      setUsage((prev) => ({
        promptTokens: (prev?.promptTokens || 0) + u.promptTokens,
        completionTokens: (prev?.completionTokens || 0) + u.completionTokens,
        totalTokens: (prev?.totalTokens || 0) + u.totalTokens,
        cost: u.cost != null ? (prev?.cost || 0) + u.cost : prev?.cost,
      }));
    });

    return () => {
      cleanupChunk();
      cleanupDone();
      cleanupError();
      cleanupToolProgress();
      cleanupUsage();
    };
  }, [setMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Reset scroll lock when user sends a new message
  const prevMessageCountRef = useRef(messages.length);
  useEffect(() => {
    const prevCount = prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    // A new user message was just added — re-engage auto-scroll
    if (
      messages.length > prevCount &&
      messages[messages.length - 1]?.role === "user"
    ) {
      userScrolledUpRef.current = false;
      scrollToBottom(true);
    }
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!isLoading) {
      inputRef.current?.focus();
    }
  }, [isLoading]);

  // Keyboard shortcut: Cmd+N for new chat
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        if (onNewChat) onNewChat();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onNewChat]);

  async function handleSend(): Promise<void> {
    const text = input.trim();
    if (!text || isLoading) return;

    setSlashMenuOpen(false);
    setInput("");

    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    // Intercept slash commands that can be handled locally
    if (text.startsWith("/")) {
      const cmd = text.split(/\s+/)[0].toLowerCase();
      const isLocal = slashCommands.some(
        (c) => c.name === cmd && (c.local || c.category === "info"),
      );
      if (isLocal) {
        if (cmd !== "/new" && cmd !== "/clear") {
          setMessages((prev) => [
            ...prev,
            { id: `user-${Date.now()}`, role: "user", content: text },
          ]);
        }
        await executeLocalCommand(text);
        return;
      }
    }

    setIsLoading(true);
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: "user", content: text },
    ]);
    onSessionStarted?.();

    try {
      await window.hermesAPI.sendMessage(
        text,
        profile,
        hermesSessionId || undefined,
        messages.map((m) => ({ role: m.role, content: m.content })),
      );
    } catch {
      // Error already handled by onChatError IPC listener — avoid duplicate
    }
  }

  async function handleQuickAsk(): Promise<void> {
    const text = input.trim();
    if (!text || isLoading) return;
    // /btw sends an ephemeral side question that doesn't pollute conversation context
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setIsLoading(true);
    setMessages((prev) => [
      ...prev,
      { id: `user-btw-${Date.now()}`, role: "user", content: `💭 ${text}` },
    ]);
    try {
      await window.hermesAPI.sendMessage(
        `/btw ${text}`,
        profile,
        hermesSessionId || undefined,
        messages.map((m) => ({ role: m.role, content: m.content })),
      );
    } catch {
      // Error already handled by onChatError IPC listener — avoid duplicate
    }
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    // Slash menu keyboard navigation
    if (slashMenuOpen && filteredSlashCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashSelectedIndex((i) =>
          i < filteredSlashCommands.length - 1 ? i + 1 : 0,
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashSelectedIndex((i) =>
          i > 0 ? i - 1 : filteredSlashCommands.length - 1,
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        handleSlashSelect(filteredSlashCommands[slashSelectedIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashMenuOpen(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>): void {
    const value = e.target.value;
    setInput(value);

    // Defer reflow-triggering resize to next frame
    const target = e.target;
    requestAnimationFrame(() => {
      target.style.height = "auto";
      target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
    });

    // Slash command detection: open menu when input starts with /
    if (value.startsWith("/") && !value.includes(" ")) {
      const query = value.split(" ")[0];
      setSlashMenuOpen(true);
      setSlashFilter(query);
      setSlashSelectedIndex(0);
    } else if (slashMenuOpen) {
      setSlashMenuOpen(false);
    }
  }

  /** Push a fake agent message into the chat (for locally-handled commands). */
  function pushLocalResponse(content: string): void {
    setMessages((prev) => [
      ...prev,
      { id: `agent-local-${Date.now()}`, role: "agent", content },
    ]);
  }

  /**
   * Execute a slash command that can be resolved entirely in the desktop app.
   * Returns true if handled, false if the command should go to the backend.
   */
  async function executeLocalCommand(cmdText: string): Promise<boolean> {
    const parts = cmdText.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();

    switch (cmd) {
      case "/new":
        onNewChat?.();
        return true;

      case "/clear":
        handleClear();
        return true;

      case "/model": {
        const display = currentModel || t("chat.states.notSet");
        const prov = currentProvider || "auto";
        const lines = [
          `**${t("chat.labels.currentModel")}** \`${display}\``,
          `**${t("chat.labels.provider")}** ${prov === "auto" ? t("chat.auto") : prov}`,
        ];

        if (currentBaseUrl) {
          lines.push(`**${t("chat.labels.baseUrl")}** ${currentBaseUrl}`);
        }

        pushLocalResponse(lines.join("\n"));
        return true;
      }

      case "/memory": {
        const mem = await window.hermesAPI.readMemory(profile);
        const lines: string[] = [`**${t("chat.labels.agentMemory")}**\n`];
        if (mem.memory.exists && mem.memory.content.trim()) {
          lines.push(mem.memory.content.trim());
        } else {
          lines.push(`_${t("chat.states.noMemory")}_`);
        }
        lines.push(
          `\n**${t("chat.labels.stats")}** ${mem.stats.totalSessions} ${t("chat.labels.sessions")}，${mem.stats.totalMessages} ${t("chat.labels.messages")}`,
        );
        pushLocalResponse(lines.join("\n"));
        return true;
      }

      case "/tools": {
        const tools = await window.hermesAPI.getToolsets(profile);
        if (!tools.length) {
          pushLocalResponse(t("chat.states.noToolsets"));
        } else {
          const rows = tools
            .map(
              (tool) =>
                `- **${tool.label}** — ${tool.description} ${tool.enabled ? `*(${t("chat.labels.enabled")})*` : `*(${t("chat.labels.disabled")})*`}`,
            )
            .join("\n");
          pushLocalResponse(`**${t("chat.labels.availableToolsets")}**\n\n${rows}`);
        }
        return true;
      }

      case "/skills": {
        const skills = await window.hermesAPI.listInstalledSkills(profile);
        if (!skills.length) {
          pushLocalResponse(t("chat.states.noSkills"));
        } else {
          const rows = skills
            .map((s) => `- **${s.name}** (${s.category}) — ${s.description}`)
            .join("\n");
          pushLocalResponse(`**${t("chat.labels.installedSkills")}**\n\n${rows}`);
        }
        return true;
      }

      case "/persona": {
        const soul = await window.hermesAPI.readSoul(profile);
        pushLocalResponse(
          soul.trim()
            ? `**${t("chat.labels.currentPersona")}**\n\n${soul.trim()}`
            : `_${t("chat.states.noPersona")}_`,
        );
        return true;
      }

      case "/version": {
        const [hermesVer, appVer] = await Promise.all([
          window.hermesAPI.getHermesVersion(),
          window.hermesAPI.getAppVersion(),
        ]);
        pushLocalResponse(
          `**${t("chat.labels.hermesAgent")}** ${hermesVer || t("chat.states.unknown")}\n**${t("chat.labels.desktopApp")}** v${appVer}`,
        );
        return true;
      }

      case "/fast": {
        const current = await window.hermesAPI.getConfig(
          "agent.service_tier",
          profile,
        );
        const isOn = current === "fast" || current === "priority";
        const next = !isOn;
        setFastMode(next);
        await window.hermesAPI.setConfig(
          "agent.service_tier",
          next ? "fast" : "normal",
          profile,
        );
        pushLocalResponse(
          next
            ? `**${t("chat.states.fastModeOn")}** — ${t("chat.states.fastModeOnHint")}`
            : `**${t("chat.states.fastModeOff")}** — ${t("chat.states.fastModeOffHint")}`,
        );
        return true;
      }

      case "/usage": {
        if (usage) {
          let md = `**${t("chat.labels.tokenUsage")}**\n\n`;
          md += `- **${t("chat.labels.prompt")}** ${usage.promptTokens.toLocaleString()} ${t("chat.labels.tokens")}\n`;
          md += `- **${t("chat.labels.completion")}** ${usage.completionTokens.toLocaleString()} ${t("chat.labels.tokens")}\n`;
          md += `- **${t("chat.labels.total")}** ${usage.totalTokens.toLocaleString()} ${t("chat.labels.tokens")}\n`;
          if (usage.cost != null) {
            md += `- **${t("chat.labels.cost")}** $${usage.cost.toFixed(4)}\n`;
          }
          pushLocalResponse(md);
        } else {
          pushLocalResponse(`_${t("chat.states.noUsage")}_`);
        }
        return true;
      }

      case "/help": {
        const grouped: Record<string, SlashCommand[]> = {};
        for (const c of slashCommands) {
          (grouped[c.category] ||= []).push(c);
        }
        const categoryLabels: Record<string, string> = {
          chat: t("chat.categories.chat"),
          agent: t("chat.categories.agent"),
          tools: t("chat.categories.tools"),
          info: t("chat.categories.info"),
        };
        let md = `**${t("chat.availableCommandsTitle")}**\n`;
        for (const cat of ["chat", "agent", "tools", "info"]) {
          if (!grouped[cat]) continue;
          md += `\n**${categoryLabels[cat]}**\n`;
          for (const c of grouped[cat]) {
            md += `\`${c.name}\` — ${t(c.descriptionKey)}\n`;
          }
        }
        pushLocalResponse(md);
        return true;
      }

      default:
        return false;
    }
  }

  function handleSlashSelect(cmd: SlashCommand): void {
    setSlashMenuOpen(false);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";

    // Commands that need no arguments — execute immediately
    if (cmd.local || ["info"].includes(cmd.category)) {
      // Show as user message for non-UI commands
      if (cmd.name !== "/new" && cmd.name !== "/clear") {
        setMessages((prev) => [
          ...prev,
          { id: `user-${Date.now()}`, role: "user", content: cmd.name },
        ]);
      }
      executeLocalCommand(cmd.name);
      return;
    }

    // For backend commands that take arguments, insert command + space
    const newValue = cmd.name + " ";
    setInput(newValue);
    inputRef.current?.focus();
  }

  function handleAbort(): void {
    window.hermesAPI.abortChat();
    setIsLoading(false);
    // Refocus input after aborting
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleClear(): void {
    // Abort any in-flight request before clearing
    if (isLoading) {
      window.hermesAPI.abortChat();
      setIsLoading(false);
    }
    setMessages([]);
    setHermesSessionId(null);
    setUsage(null);
    setToolProgress(null);
  }

  const handleApprove = useCallback(() => {
    setInput("");
    setIsLoading(true);
    setMessages((prev) => [
      ...prev,
      { id: `user-approve-${Date.now()}`, role: "user", content: "/approve" },
    ]);
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    window.hermesAPI
      .sendMessage("/approve", profile, hermesSessionId || undefined, history)
      .catch(() => setIsLoading(false));
  }, [profile, hermesSessionId, setMessages, messages]);

  const handleDeny = useCallback(() => {
    setInput("");
    setIsLoading(true);
    setMessages((prev) => [
      ...prev,
      { id: `user-deny-${Date.now()}`, role: "user", content: "/deny" },
    ]);
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    window.hermesAPI
      .sendMessage("/deny", profile, hermesSessionId || undefined, history)
      .catch(() => setIsLoading(false));
  }, [profile, hermesSessionId, setMessages, messages]);

  const visibleMessages = useMemo(
    () => messages.filter((m) => m.content.trim()),
    [messages],
  );

  const displayModel = useMemo(
    () =>
      currentModel
        ? currentModel.split("/").pop() || currentModel
        : currentProvider === "auto"
          ? t("chat.auto")
          : t("chat.noModel"),
    [currentModel, currentProvider, t],
  );

  const lastMessageIsAgent = useMemo(
    () => messages.length > 0 && messages[messages.length - 1].role === "agent",
    [messages],
  );

  return (
    <div className="chat-container">
      <div className="chat-header">
        <div className="chat-header-left">
          <div className="chat-header-title">
            {sessionId
              ? t("chat.sessionTitle", { id: sessionId.slice(-6) })
              : t("chat.title")}
          </div>
          {usage && (
            <span
              className="chat-token-counter"
              title={`${t("chat.labels.prompt")} ${usage.promptTokens.toLocaleString()} | ${t("chat.labels.completion")} ${usage.completionTokens.toLocaleString()}${usage.cost != null ? ` | ${t("chat.labels.cost")} $${usage.cost.toFixed(4)}` : ""}`}
            >
              {usage.totalTokens.toLocaleString()} {t("chat.labels.tokens")}
              {usage.cost != null && (
                <span className="chat-cost"> · ${usage.cost.toFixed(4)}</span>
              )}
            </span>
          )}
        </div>
        <div className="chat-header-actions">
          <div className="chat-fast-wrapper">
            <button
              className={`btn-ghost chat-fast-btn ${fastMode ? "chat-fast-active" : ""}`}
              onClick={async () => {
                const next = !fastMode;
                setFastMode(next);
                await window.hermesAPI.setConfig(
                  "agent.service_tier",
                  next ? "fast" : "normal",
                  profile,
                );
              }}
            >
              <Zap size={14} />
            </button>
            <div className="chat-fast-popover">
              <strong>
                {fastMode ? t("chat.fastModeOnLabel") : t("chat.fastModeLabel")}
              </strong>
              <span>
                {fastMode
                  ? t("chat.fastModeOnHint")
                  : t("chat.fastModeOffHint")}
              </span>
            </div>
          </div>
          {onNewChat && (
            <button
              className="btn-ghost chat-clear-btn"
              onClick={onNewChat}
              title={t("chat.newChatTitle")}
            >
              <Plus size={16} />
            </button>
          )}
          {messages.length > 0 && (
            <button
              className="btn-ghost chat-clear-btn"
              onClick={handleClear}
              title={t("chat.clearChatTitle")}
            >
              <Trash size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="chat-messages" ref={messagesContainerRef}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-icon">
              <img src={icon} width={64} height={64} alt="" />
            </div>
            <div className="chat-empty-text">{t("chat.emptyTitle")}</div>
            <div className="chat-empty-hint">
              {t("chat.emptyHint")}
            </div>
            <div className="chat-empty-suggestions">
              <button
                className="chat-suggestion"
                onClick={() => {
                  setInput(t("chat.suggestionSearchPrompt"));
                  inputRef.current?.focus();
                }}
                >
                  <Search size={16} />
                  {t("chat.suggestionSearch")}
                </button>
              <button
                className="chat-suggestion"
                onClick={() => {
                  setInput(t("chat.suggestionReminderPrompt"));
                  inputRef.current?.focus();
                }}
                >
                  <Bell size={16} />
                  {t("chat.suggestionReminder")}
                </button>
              <button
                className="chat-suggestion"
                onClick={() => {
                  setInput(t("chat.suggestionEmailPrompt"));
                  inputRef.current?.focus();
                }}
                >
                  <Mail size={16} />
                  {t("chat.suggestionEmail")}
                </button>
              <button
                className="chat-suggestion"
                onClick={() => {
                  setInput(t("chat.suggestionScriptPrompt"));
                  inputRef.current?.focus();
                }}
                >
                  <Code size={16} />
                  {t("chat.suggestionScript")}
                </button>
              <button
                className="chat-suggestion"
                onClick={() => {
                  setInput(t("chat.suggestionSchedulePrompt"));
                  inputRef.current?.focus();
                }}
                >
                  <Clock size={16} />
                  {t("chat.suggestionSchedule")}
                </button>
              <button
                className="chat-suggestion"
                onClick={() => {
                  setInput(t("chat.suggestionAnalyzePrompt"));
                  inputRef.current?.focus();
                }}
                >
                  <ChartLine size={16} />
                  {t("chat.suggestionAnalyze")}
                </button>
            </div>
          </div>
        ) : (
          visibleMessages.map((msg, i) => (
            <MessageRow
              key={msg.id}
              msg={msg}
              isLast={i === visibleMessages.length - 1}
              isLoading={isLoading}
              onApprove={handleApprove}
              onDeny={handleDeny}
              approveLabel={t("chat.approve")}
              denyLabel={t("chat.deny")}
            />
          ))
        )}

        {isLoading && !lastMessageIsAgent && (
          <div className="chat-message chat-message-agent">
            <HermesAvatar />
            <div className="chat-bubble chat-bubble-agent">
              {toolProgress ? (
                <div className="chat-tool-progress">{toolProgress}</div>
              ) : (
                <div className="chat-typing">
                  <span className="chat-typing-dot" />
                  <span className="chat-typing-dot" />
                  <span className="chat-typing-dot" />
                </div>
              )}
            </div>
          </div>
        )}

        {isLoading && toolProgress && lastMessageIsAgent && (
          <div className="chat-tool-progress-inline">{toolProgress}</div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        {slashMenuOpen && filteredSlashCommands.length > 0 && (
          <div className="slash-menu" ref={slashMenuRef}>
            <div className="slash-menu-header">
              <Slash size={12} />
              {t("chat.commandsTitle")}
            </div>
            <div className="slash-menu-list">
              {filteredSlashCommands.map((cmd, i) => (
                <button
                  key={cmd.name}
                  className={`slash-menu-item ${i === slashSelectedIndex ? "slash-menu-item-active" : ""}`}
                  onMouseEnter={() => setSlashSelectedIndex(i)}
                  onClick={() => handleSlashSelect(cmd)}
                >
                  <span className="slash-menu-item-name">{cmd.name}</span>
                  <span className="slash-menu-item-desc">
                    {cmd.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="chat-input-wrapper">
          <textarea
            ref={inputRef}
            className="chat-input"
            placeholder={t("chat.typeMessage")}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={isLoading}
            autoFocus
          />
          {isLoading ? (
            <button
              className="chat-send-btn chat-stop-btn"
              onClick={handleAbort}
              title={t("chat.stop")}
            >
              <Stop size={14} />
            </button>
          ) : (
            <>
              {input.trim() && hermesSessionId && (
                <button
                  className="chat-btw-btn"
                  onClick={handleQuickAsk}
                  title={t("chat.quickAskTitle")}
                >
                  💭
                </button>
              )}
              <button
                className="chat-send-btn"
                onClick={handleSend}
                disabled={!input.trim()}
                title={t("chat.send")}
              >
                <Send size={16} />
              </button>
            </>
          )}
        </div>

        <div className="chat-model-bar" ref={pickerRef}>
          <button
            className="chat-model-trigger"
            onClick={() => {
              if (!showModelPicker) loadModelConfig();
              setShowModelPicker(!showModelPicker);
            }}
          >
            <span className="chat-model-name">{displayModel}</span>
            <ChevronDown size={12} />
          </button>

          {showModelPicker && (
            <div className="chat-model-dropdown">
              {modelGroups.map((group) => (
                <div key={group.provider} className="chat-model-group">
                  <div className="chat-model-group-label">
                    {group.providerLabel}
                  </div>
                  {group.models.map((m) => (
                    <button
                      key={m.id || `${m.provider}:${m.model}`}
                      className={`chat-model-option ${currentModel === m.model && currentProvider === m.provider ? "active" : ""}`}
                      onClick={() =>
                        selectModel(m.provider, m.model, m.baseUrl, m.id)
                      }
                    >
                      <span className="chat-model-option-label">{m.label}</span>
                      <span className="chat-model-option-id">{m.model}</span>
                    </button>
                  ))}
                </div>
              ))}

              {!hasPlatformModels && (
                <div className="chat-model-group">
                  <div className="chat-model-group-label">{t("chat.custom")}</div>
                  <div className="chat-model-custom">
                    <input
                      className="chat-model-custom-input"
                      type="text"
                      value={customModelInput}
                      onChange={(e) => setCustomModelInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCustomModelSubmit();
                      }}
                      placeholder={t("chat.typeModelName")}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Chat;
