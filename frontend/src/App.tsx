import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Maximize2,
  Minimize2,
  WrapText,
  Activity,
  AlertTriangle,
  Bell,
  BellOff,
  ChevronDown,
  Box,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileDown,
  FolderOpen,
  HardDrive,
  History,
  Heart,
  KeyRound,
  LayoutGrid,
  ListTree,
  MemoryStick,
  Network,
  Play,
  Plus,
  Power,
  RefreshCw,
  RotateCw,
  Search,
  Send,
  Server,
  Radio,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Skull,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  Upload,
  Wifi,
  WifiOff,
  X,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  FileText,
  HelpCircle,
  XCircle,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { QRCodeSVG } from 'qrcode.react';
import {
  ControlDocker,
  ControlService,
  DeleteServer,
  GetDemoServers,
  GetDockerLogs,
  GetServerMetrics,
  GetServers,
  GetServiceLogs,
  GetSettings,
  ImportSSHConfig,
  KillProcess,
  RebootServer,
  CancelQuickCommand,
  StartQuickCommand,
  SaveServer,
  EvaluateServerAlerts,
  UpdateTraySummary,
  SaveSettings,
  SelectKeyFile,
  TestConnection,
  ToggleDemoOutage,
} from '../wailsjs/go/main/App';
import { main } from '../wailsjs/go/models';
import { BrowserOpenURL, EventsOn } from '../wailsjs/runtime/runtime';
import { LanguageCode, translations } from './i18n';
import type { PtyContainerTarget } from './PtyTerminal';
const PtyTerminal = lazy(() => import('./PtyTerminal'));
import { getPtyStrings } from './ptyI18n';
import SftpManager from './SftpManager';
import { getAlertStrings } from './alertI18n';
import { getSftpStrings } from './sftpI18n';
import type { SettingsTab } from './SettingsModal';
const SettingsModal = lazy(() => import('./SettingsModal'));
import { getSettingsStrings } from './settingsI18n';
const HistoryPanel = lazy(() => import('./HistoryPanel'));
import { getHistoryStrings } from './historyI18n';
const SecurityCronPanel = lazy(() => import('./SecurityCronPanel'));
import { getSecurityCronStrings } from './securityCronI18n';
const BroadcastSnippetsModal = lazy(() => import('./BroadcastSnippetsModal'));
import { getBroadcastStrings } from './broadcastI18n';
import { describeProcess, describeService, describeTerminalCommand, getLogsModalStrings } from './linuxKnowledge';
import { explainConnectionError, getErrorTechLabel } from './errorExplain';
import { HELP_TOOLTIPS } from './helpTooltips';
import { DONATION_WALLETS } from './wallets';

interface HistoryPoint {
  time: string;
  cpu: number;
  ram: number;
  rx: number;
  tx: number;
}

interface AlertEvent {
  id: string;
  serverName: string;
  type: 'outage' | 'recovered' | 'cpu' | 'ram' | 'disk' | 'service';
  detail?: string;
  time: string;
  read: boolean;
}

interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface TerminalEntry {
  id: string;
  cmd: string;
  output: string;
  success: boolean;
  durationMs: number;
  time: string;
  running?: boolean;
}

type TermCategory = 'system' | 'storage' | 'network' | 'updates' | 'logs';
type ProcSortKey = 'cpu' | 'mem' | 'pid' | 'command';

interface ConfirmDialogState {
  title: string;
  message: string;
  warning: string;
  confirmLabel: string;
  tone: 'danger' | 'warning';
  onConfirm: () => void;
}

type ServerTab = 'overview' | 'history' | 'security' | 'processes' | 'docker' | 'services' | 'network' | 'files' | 'terminal';

const MAX_HISTORY = 30;
const DOT = '\u2022';
const DASH = '\u2014';
const MASK_IP = `${DOT.repeat(3)}.${DOT.repeat(3)}.${DOT.repeat(3)}.${DOT.repeat(3)}`;
const MASK_SECRET = DOT.repeat(10);
const TERMINAL_PRESETS: Record<TermCategory, { label: string; cmd: string }[]> = {
  system: [
    { label: 'System Info', cmd: 'uname -a' },
    { label: 'Uptime', cmd: 'uptime' },
    { label: 'Whoami', cmd: 'whoami' },
    { label: 'Host Info', cmd: 'hostnamectl 2>/dev/null || hostname' },
  ],
  storage: [
    { label: 'Memory', cmd: 'free -h' },
    { label: 'Disk Usage', cmd: 'df -h' },
    { label: 'Block Devices', cmd: 'lsblk' },
    { label: 'Largest Dirs', cmd: 'du -sh /* 2>/dev/null | sort -hr | head -n 10' },
  ],
  network: [
    { label: 'IP Addresses', cmd: 'ip -br a 2>/dev/null || ifconfig' },
    { label: 'Open Ports', cmd: 'ss -tulnp 2>/dev/null || ss -tuln' },
    { label: 'Public IP', cmd: 'curl -s --max-time 5 ifconfig.me; echo ""' },
    { label: 'Ping 1.1.1.1', cmd: 'ping -c 3 1.1.1.1' },
  ],
  updates: [
    { label: 'APT Update', cmd: 'sudo -n apt update || apt update' },
    { label: 'Upgradable', cmd: 'apt list --upgradable 2>/dev/null' },
    { label: 'Clean Cache', cmd: 'sudo -n apt autoremove -y && sudo -n apt autoclean' },
  ],
  logs: [
    { label: 'System Errors', cmd: 'journalctl -p 3 -n 25 --no-pager' },
    { label: 'Kernel Log', cmd: 'dmesg -T 2>/dev/null | tail -n 20 || dmesg | tail -n 20' },
    { label: 'Last Logins', cmd: 'last -n 10' },
  ],
};

function formatRate(kbps: number): string {
  if (!Number.isFinite(kbps) || kbps < 0) return '0 KB/s';
  if (kbps >= 1024) return `${(kbps / 1024).toFixed(2)} MB/s`;
  return `${kbps.toFixed(1)} KB/s`;
}

function maskText(val: string, privacy: boolean): string {
  return privacy ? MASK_IP : val;
}

function getScoreColor(score: number): string {
  if (score >= 85) return '#34d399';
  if (score >= 60) return '#fbbf24';
  return '#fb7185';
}

function getBarColor(pct: number): string {
  if (pct >= 85) return 'from-rose-500 to-red-400';
  if (pct >= 70) return 'from-amber-500 to-yellow-400';
  return 'from-cyan-400 to-indigo-500';
}

const emptyServerForm = (): main.ServerConfig =>
  main.ServerConfig.createFrom({
    id: '',
    name: '',
    host: '',
    port: 22,
    username: 'root',
    authType: 'password',
    password: '',
    keyPath: '',
    privateKey: '',
    group: 'Production',
    isDemo: false,
    useProxy: false,
    proxyHost: '127.0.0.1',
    proxyPort: 1080,
    proxyUser: '',
    proxyPass: '',
    hasPassword: false,
    hasPrivateKey: false,
    hasProxyPass: false,
    alertRules: {
      configured: true,
      muted: false,
      onOutage: true,
      onFailedSvc: true,
      cpuThreshold: 90,
      ramThreshold: 90,
      diskThreshold: 85,
      cooldownMin: 10,
    },
  });

function HelpTip({ text }: { text: string }) {
  const [pos, setPos] = useState<{ top: number; left: number; below: boolean } | null>(null);
  const ref = useRef<HTMLSpanElement | null>(null);

  const handleEnter = () => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = 252;
    const half = width / 2;
    const left = Math.max(half + 12, Math.min(window.innerWidth - half - 12, rect.left + rect.width / 2));
    const below = rect.top < 115;
    const top = below ? rect.bottom + 8 : rect.top - 8;
    setPos({ top, left, below });
  };

  return (
    <span
      ref={ref}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setPos(null)}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex shrink-0 cursor-help items-center text-slate-500 transition hover:text-cyan-300"
    >
      <HelpCircle className="h-3.5 w-3.5" />
      {pos &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              transform: pos.below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
              width: 252,
              zIndex: 9999,
            }}
            className="pointer-events-none rounded-xl border border-cyan-400/25 bg-slate-950/95 px-3 py-2 text-start text-[11px] font-normal normal-case tracking-normal leading-relaxed text-slate-200 shadow-2xl backdrop-blur-xl"
          >
            {text}
          </div>,
          document.body
        )}
    </span>
  );
}

export default function App() {
  const [settings, setSettings] = useState<main.AppSettings>(() =>
    main.AppSettings.createFrom({
      language: 'en',
      viewMode: 'simple',
      privacyMode: false,
      pollIntervalSec: 2,
    })
  );

  const [servers, setServers] = useState<main.ServerConfig[]>([]);
  const [demoServers, setDemoServers] = useState<main.ServerConfig[]>([]);
  const [demoMode, setDemoMode] = useState<boolean>(false);
  const [viewPage, setViewPage] = useState<'server' | 'fleet'>('server');
  const [activeTab, setActiveTab] = useState<ServerTab>('overview');
  const [termMode, setTermMode] = useState<'pty' | 'quick'>('pty');
  const [ptyTargets, setPtyTargets] = useState<Record<string, PtyContainerTarget | null>>({});
  const [mountedPtyIds, setMountedPtyIds] = useState<string[]>([]);
  const [ptyStatusMap, setPtyStatusMap] = useState<Record<string, 'connecting' | 'connected' | 'disconnected'>>({});
  const [sftpMounted, setSftpMounted] = useState(false);
  const serverTabMapRef = useRef<Record<string, ServerTab>>({});
  const prevSelectedIdRef = useRef<string>('');
  const activeTabRef = useRef<ServerTab>(activeTab);
  activeTabRef.current = activeTab;
  const ptyStatusRef = useRef<Record<string, 'connecting' | 'connected' | 'disconnected'>>(ptyStatusMap);
  ptyStatusRef.current = ptyStatusMap;
  const [selectedId, setSelectedId] = useState<string>('');

  const [metricsMap, setMetricsMap] = useState<Record<string, main.ServerMetrics>>({});
  const [historyMap, setHistoryMap] = useState<Record<string, HistoryPoint[]>>({});
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Dropdowns & Modals
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [logsWrap, setLogsWrap] = useState(true);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [logsCopied, setLogsCopied] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general');
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [serverModalOpen, setServerModalOpen] = useState(false);

  useEffect(() => {
    const off = EventsOn('zentradeck:alert', (al: any) => {
      if (!al || !al.id) return;
      setAlerts((prev) => [
        {
          id: al.id,
          serverName: al.serverName,
          type: al.type,
          detail: al.detail,
          time: al.time || new Date().toLocaleTimeString(),
          read: false,
        },
        ...prev.slice(0, 39),
      ]);
    });
    return () => {
      if (typeof off === 'function') off();
    };
  }, []);
  const [alertRulesOpen, setAlertRulesOpen] = useState(false);
  const [serverForm, setServerForm] = useState<main.ServerConfig>(emptyServerForm);
  const [testingConn, setTestingConn] = useState(false);
  const [testResult, setTestResult] = useState<main.ActionResult | null>(null);

  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [selectedWalletId, setSelectedWalletId] = useState(DONATION_WALLETS[0].id);
  const [copiedAddr, setCopiedAddr] = useState(false);

  const [logsModal, setLogsModal] = useState<{
    open: boolean;
    kind: 'service' | 'docker';
    target: string;
    title: string;
    content: string;
    loading: boolean;
  }>({ open: false, kind: 'service', target: '', title: '', content: '', loading: false });

  // Services / Docker / Process / Terminal state
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceFilter, setServiceFilter] = useState<'all' | 'active' | 'failed' | 'inactive'>('all');
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [cmdInput, setCmdInput] = useState('');
  const [cmdRunning, setCmdRunning] = useState(false);
  const [terminalMap, setTerminalMap] = useState<Record<string, TerminalEntry[]>>({});
  const [termCat, setTermCat] = useState<TermCategory>('system');
  const [procSort, setProcSort] = useState<{ key: ProcSortKey; dir: 'asc' | 'desc' }>({
    key: 'cpu',
    dir: 'desc',
  });
  const [confirmModal, setConfirmModal] = useState<ConfirmDialogState | null>(null);
  const failCountRef = useRef<Record<string, number>>({});
  const termEndRef = useRef<HTMLDivElement | null>(null);
  const cmdHistoryRef = useRef<string[]>([]);
  const [cmdHistIdx, setCmdHistIdx] = useState(-1);

  const prevOnlineRef = useRef<Record<string, boolean>>({});
  const lang = (settings.language as LanguageCode) in translations ? (settings.language as LanguageCode) : 'en';
  const t = translations[lang];
  const ta = getAlertStrings(lang);
  const h = HELP_TOOLTIPS[lang] || HELP_TOOLTIPS.en;
  const isPro = settings.viewMode === 'pro';
  const isRtl = lang === 'fa';

  useEffect(() => {
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [isRtl, lang]);

  const activeServers = demoMode ? demoServers : servers;
  const selectedServer = useMemo(
    () => activeServers.find((s) => s.id === selectedId) || activeServers[0] || null,
    [activeServers, selectedId]
  );

  const currentMetrics = selectedServer ? metricsMap[selectedServer.id] : undefined;
  const currentHistory = selectedServer ? historyMap[selectedServer.id] || [] : [];
  const currentTerminal = selectedServer ? terminalMap[selectedServer.id] || [] : [];

  const pushToast = useCallback((type: ToastItem['type'], text: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev.slice(-3), { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3500);
  }, []);

  // Auto-fallback from Pro-only tabs when switching to Simple
  useEffect(() => {
    if (!isPro && (activeTab === 'network' || activeTab === 'files' || activeTab === 'terminal')) {
      setActiveTab('overview');
    }
  }, [isPro, activeTab]);

  // Initial load
  useEffect(() => {
    (async () => {
      try {
        const [loadedSettings, savedServers, demos] = await Promise.all([
          GetSettings(),
          GetServers(),
          GetDemoServers(),
        ]);
        if (loadedSettings) setSettings(loadedSettings);
        const list = savedServers || [];
        const demoList = demos || [];
        setServers(list);
        setDemoServers(demoList);
        if (list.length > 0) {
          setDemoMode(false);
          setSelectedId(list[0].id);
        } else {
          setDemoMode(true);
          if (demoList.length > 0) setSelectedId(demoList[0].id);
        }
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  const updateSettings = useCallback(
    async (patch: Partial<main.AppSettings>) => {
      const next = main.AppSettings.createFrom({ ...settings, ...patch });
      setSettings(next);
      try {
        await SaveSettings(next);
      } catch (err) {
        console.error(err);
      }
    },
    [settings]
  );

  // Live streaming terminal events
  useEffect(() => {
    const offChunk = EventsOn('terminal:chunk', (payload: any) => {
      if (!payload?.serverId || !payload?.runId) return;
      setTerminalMap((prev) => {
        const list = prev[payload.serverId] || [];
        return {
          ...prev,
          [payload.serverId]: list.map((item) =>
            item.id === payload.runId ? { ...item, output: item.output + String(payload.text || '') } : item
          ),
        };
      });
    });
    const offDone = EventsOn('terminal:done', (payload: any) => {
      if (!payload?.serverId || !payload?.runId) return;
      setTerminalMap((prev) => {
        const list = prev[payload.serverId] || [];
        return {
          ...prev,
          [payload.serverId]: list.map((item) =>
            item.id === payload.runId
              ? {
                  ...item,
                  running: false,
                  success: !!payload.success,
                  durationMs: Number(payload.durationMs || 0),
                  output: item.output || '(no output)',
                }
              : item
          ),
        };
      });
      setCmdRunning(false);
    });
    return () => {
      offChunk();
      offDone();
    };
  }, []);

  // Auto-scroll live terminal output
  useEffect(() => {
    if (activeTab === 'terminal') {
      termEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentTerminal, activeTab]);

  // Sequential live metrics polling (no overlap on high latency + 2-strike outage debounce)
  useEffect(() => {
    if (activeServers.length === 0) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const pollAll = async () => {
      let onlineCount = 0;
      await Promise.all(
        activeServers.map(async (srv) => {
          try {
            const m = await GetServerMetrics(srv.id);
            if (cancelled) return;

            const prevOnline = prevOnlineRef.current[srv.id];

            if (m.online) {
              onlineCount += 1;
              failCountRef.current[srv.id] = 0;
              prevOnlineRef.current[srv.id] = true;
              setMetricsMap((prev) => ({ ...prev, [srv.id]: m }));
              setHistoryMap((prev) => {
                const existing = prev[srv.id] || [];
                const point: HistoryPoint = {
                  time: m.timestamp,
                  cpu: m.cpuPercent,
                  ram: m.ramPercent,
                  rx: m.netRxKBps,
                  tx: m.netTxKBps,
                };
                return {
                  ...prev,
                  [srv.id]: [...existing.slice(-(MAX_HISTORY - 1)), point],
                };
              });
            } else {
              const fails = (failCountRef.current[srv.id] || 0) + 1;
              failCountRef.current[srv.id] = fails;
              if (!srv.isDemo && prevOnline === true && fails < 2) {
                onlineCount += 1;
                return;
              }
              prevOnlineRef.current[srv.id] = false;
              setMetricsMap((prev) => ({ ...prev, [srv.id]: m }));
            }

            try {
              const triggered = await EvaluateServerAlerts(srv.id, srv.name, !!srv.isDemo, m);
              if (!cancelled && triggered && triggered.length > 0) {
                setAlerts((prev) => [
                  ...triggered.map((al) => ({
                    id: al.id,
                    serverName: al.serverName,
                    type: al.type as 'outage' | 'recovered' | 'cpu' | 'ram' | 'disk' | 'service',
                    detail: al.detail,
                    time: al.time || m.timestamp || new Date().toLocaleTimeString(),
                    read: false,
                  })),
                  ...prev.slice(0, 39),
                ]);
              }
            } catch {
              // ignore alert eval errors
            }
          } catch (err) {
            console.error(err);
          }
        })
      );
      if (!cancelled) {
        UpdateTraySummary(onlineCount, activeServers.length).catch(() => {});
      }

      if (!cancelled) {
        const intervalMs = Math.max(2, settings.pollIntervalSec || 2) * 1000;
        timer = setTimeout(pollAll, intervalMs);
      }
    };

    pollAll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeServers, settings.pollIntervalSec]);

    const refreshSelectedMetrics = async () => {
    if (!selectedServer) return;
    const m = await GetServerMetrics(selectedServer.id);
    setMetricsMap((prev) => ({ ...prev, [selectedServer.id]: m }));
  };

  // Handlers
  const handleToggleDemo = () => {
    if (demoMode) {
      setDemoMode(false);
      setSelectedId(servers[0]?.id || '');
    } else {
      setDemoMode(true);
      setSelectedId(demoServers[0]?.id || '');
    }
    setViewPage('server');
  };

  const handleOpenAddServer = () => {
    setServerForm(emptyServerForm());
    setTestResult(null);
    setAlertRulesOpen(false);
    setServerModalOpen(true);
  };

  const handleOpenEditServer = (srv: main.ServerConfig, e: React.MouseEvent) => {
    e.stopPropagation();
    setServerForm(main.ServerConfig.createFrom(srv));
    setTestResult(null);
    setAlertRulesOpen(false);
    setServerModalOpen(true);
  };

  const handleBrowseKeyFile = async () => {
    try {
      const picked = await SelectKeyFile();
      if (picked) {
        setServerForm(main.ServerConfig.createFrom({ ...serverForm, keyPath: picked }));
      }
    } catch (err) {
      pushToast('error', String(err));
    }
  };

  const handleTestConnection = async () => {
    setTestingConn(true);
    setTestResult(null);
    try {
      const res = await TestConnection(main.ServerConfig.createFrom(serverForm));
      setTestResult(res);
    } catch (err) {
      setTestResult(main.ActionResult.createFrom({ success: false, message: String(err) }));
    } finally {
      setTestingConn(false);
    }
  };

  const handleSaveServer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const saved = await SaveServer(main.ServerConfig.createFrom(serverForm));
      const updated = await GetServers();
      setServers(updated || []);
      setDemoMode(false);
      setSelectedId(saved.id);
      setViewPage('server');
      setServerModalOpen(false);
      pushToast('success', `${saved.name} saved`);
    } catch (err) {
      pushToast('error', String(err));
    }
  };

  const handleDeleteServer = (srv: main.ServerConfig, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmModal({
      title: t.deleteServer,
      message: `${t.confirmDelete} (${srv.name})`,
      warning: t.deleteWarning,
      confirmLabel: t.deleteServer,
      tone: 'danger',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await DeleteServer(srv.id);
          const updated = await GetServers();
          setServers(updated || []);
          if (selectedId === srv.id) {
            setSelectedId(updated?.[0]?.id || '');
          }
          pushToast('info', `${srv.name} removed`);
        } catch (err) {
          pushToast('error', String(err));
        }
      },
    });
  };

    const handleImportSSH = async () => {
    try {
      const count = await ImportSSHConfig();
      if (count < 0) return;
      const updated = await GetServers();
      setServers(updated || []);
      if (count > 0 && updated && updated.length > 0) {
        setDemoMode(false);
        setSelectedId(updated[updated.length - 1].id);
        setViewPage('server');
      }
      pushToast('success', `${t.importedCount} ${count}`);
    } catch (err) {
      pushToast('error', String(err));
    }
  };

  const handleToggleDemoOutage = async () => {
    if (!selectedServer || !selectedServer.isDemo) return;
    await ToggleDemoOutage(selectedServer.id);
    await refreshSelectedMetrics();
  };

  const handleRebootServer = () => {
    if (!selectedServer) return;
    const srv = selectedServer;
    setConfirmModal({
      title: t.rebootServer,
      message: `${t.confirmReboot} (${srv.name})`,
      warning: t.rebootWarning,
      confirmLabel: t.rebootServer,
      tone: 'warning',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const res = await RebootServer(srv.id);
          pushToast(res.success ? 'info' : 'error', res.message);
          await refreshSelectedMetrics();
        } catch (err) {
          pushToast('error', String(err));
        }
      },
    });
  };

    const handleServiceAction = async (serviceName: string, action: 'start' | 'stop' | 'restart') => {
    if (!selectedServer) return;
    setBusyAction(`svc:${serviceName}:${action}`);
    try {
      const res = await ControlService(selectedServer.id, serviceName, action);
      pushToast(res.success ? 'success' : 'error', res.message);
      if (res.success) await refreshSelectedMetrics();
    } catch (err) {
      pushToast('error', String(err));
    } finally {
      setBusyAction(null);
    }
  };

  // Per-server remembered tab + auto-dispose disconnected PTYs on server switch
  useEffect(() => {
    const prevId = prevSelectedIdRef.current;
    const serverChanged = prevId !== selectedId;
    if (prevId && serverChanged) {
      serverTabMapRef.current[prevId] = activeTabRef.current;
      setMountedPtyIds((prev) =>
        prev.filter(
          (id) =>
            id === selectedId ||
            ptyStatusRef.current[id] === 'connected' ||
            ptyStatusRef.current[id] === 'connecting'
        )
      );
    }
    prevSelectedIdRef.current = selectedId;

    // Only restore the remembered tab when the server actually changed.
    // serverTabMapRef is only written when switching AWAY from a server, so
    // re-running this restore on the Simple/Pro toggle would clobber the
    // current tab with a stale value - or 'overview' for a server that was
    // never switched away from. (The Pro -> Simple fallback for pro-only
    // tabs lives in its own effect below.)
    if (selectedId && serverChanged) {
      const remembered = serverTabMapRef.current[selectedId] || 'overview';
      const safeTab =
        !isPro && (remembered === 'network' || remembered === 'files' || remembered === 'terminal')
          ? 'overview'
          : remembered;
      setActiveTab(safeTab);
    }
  }, [selectedId, isPro]);

  useEffect(() => {
    if (isPro && activeTab === 'terminal' && termMode === 'pty' && selectedId) {
      setMountedPtyIds((prev) => (prev.includes(selectedId) ? prev : [...prev, selectedId]));
    }
    if (isPro && activeTab === 'files') {
      setSftpMounted(true);
    }
  }, [activeTab, termMode, isPro, selectedId]);

  // Clean up PTY instances if a server is deleted or demo mode is toggled
  useEffect(() => {
    const validIds = new Set(activeServers.map((s) => s.id));
    setMountedPtyIds((prev) => {
      const next = prev.filter((id) => validIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [activeServers]);

  const handleOpenDockerShell = (target: PtyContainerTarget) => {
    if (!selectedServer) return;
    if (!isPro) {
      updateSettings({ viewMode: 'pro' });
    }
    setPtyTargets((prev) => ({ ...prev, [selectedServer.id]: target }));
    setMountedPtyIds((prev) => (prev.includes(selectedServer.id) ? prev : [...prev, selectedServer.id]));
    setTermMode('pty');
    setActiveTab('terminal');
  };

  const handleDockerAction = async (containerId: string, action: 'start' | 'stop' | 'restart') => {
    if (!selectedServer) return;
    setBusyAction(`dkr:${containerId}:${action}`);
    try {
      const res = await ControlDocker(selectedServer.id, containerId, action);
      pushToast(res.success ? 'success' : 'error', res.message);
      if (res.success) await refreshSelectedMetrics();
    } catch (err) {
      pushToast('error', String(err));
    } finally {
      setBusyAction(null);
    }
  };

  const handleKillProcess = (proc: main.ProcessInfo, force: boolean) => {
    if (!selectedServer) return;
    const srvId = selectedServer.id;
    setConfirmModal({
      title: force ? t.forceKill : t.kill,
      message: `${t.confirmKill} #${proc.pid} (${proc.command})?`,
      warning: t.killWarning,
      confirmLabel: force ? t.forceKill : t.kill,
      tone: 'danger',
      onConfirm: async () => {
        setConfirmModal(null);
        setBusyAction(`proc:${proc.pid}`);
        try {
          const res = await KillProcess(srvId, proc.pid, force);
          pushToast(res.success ? 'success' : 'error', res.message);
          if (res.success) await refreshSelectedMetrics();
        } catch (err) {
          pushToast('error', String(err));
        } finally {
          setBusyAction(null);
        }
      },
    });
  };

    const handleOpenLogs = async (kind: 'service' | 'docker', target: string, title: string) => {
    if (!selectedServer) return;
    setLogsModal({ open: true, kind, target, title, content: '', loading: true });
    try {
      const output =
        kind === 'service'
          ? await GetServiceLogs(selectedServer.id, target)
          : await GetDockerLogs(selectedServer.id, target);
      setLogsModal({ open: true, kind, target, title, content: output || '(empty)', loading: false });
    } catch (err) {
      setLogsModal({ open: true, kind, target, title, content: String(err), loading: false });
    }
  };

  const handleRunCommand = async (rawCmd?: string) => {
    if (!selectedServer) return;
    const command = (rawCmd ?? cmdInput).trim();
    if (!command) return;
    const runId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const srvId = selectedServer.id;

    if (!rawCmd) {
      cmdHistoryRef.current = [command, ...cmdHistoryRef.current.filter((c) => c !== command)].slice(0, 30);
      setCmdHistIdx(-1);
      setCmdInput('');
    }

    const entry: TerminalEntry = {
      id: runId,
      cmd: command,
      output: '',
      success: true,
      durationMs: 0,
      time: new Date().toLocaleTimeString(),
      running: true,
    };
    setTerminalMap((prev) => ({
      ...prev,
      [srvId]: [...(prev[srvId] || []).slice(-19), entry],
    }));
    setCmdRunning(true);

    try {
      const res = await StartQuickCommand(srvId, runId, command);
      if (!res.success) {
        setTerminalMap((prev) => ({
          ...prev,
          [srvId]: (prev[srvId] || []).map((item) =>
            item.id === runId ? { ...item, running: false, success: false, output: res.message } : item
          ),
        }));
        setCmdRunning(false);
      }
    } catch (err) {
      setCmdRunning(false);
      pushToast('error', String(err));
    }
  };

  const handleStopCommand = async () => {
    if (!selectedServer) return;
    try {
      await CancelQuickCommand(selectedServer.id);
    } catch (err) {
      pushToast('error', String(err));
    }
  };

    const handleCopyWallet = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddr(true);
      setTimeout(() => setCopiedAddr(false), 1800);
    } catch {
      pushToast('error', 'Clipboard unavailable');
    }
  };

  const unreadAlerts = alerts.filter((a) => !a.read).length;

  const filteredServices = useMemo(() => {
    const list = currentMetrics?.services || [];
    return list.filter((svc) => {
      const matchesFilter =
        serviceFilter === 'all' ||
        (serviceFilter === 'active' && svc.status === 'active') ||
        (serviceFilter === 'failed' && svc.status === 'failed') ||
        (serviceFilter === 'inactive' && svc.status !== 'active' && svc.status !== 'failed');
      const q = serviceSearch.trim().toLowerCase();
      const matchesSearch =
        !q || svc.name.toLowerCase().includes(q) || svc.description.toLowerCase().includes(q);
      return matchesFilter && matchesSearch;
    });
  }, [currentMetrics?.services, serviceFilter, serviceSearch]);

  const fleetStats = useMemo(() => {
    const total = activeServers.length;
    let online = 0;
    let cpuSum = 0;
    let ramSum = 0;
    for (const s of activeServers) {
      const m = metricsMap[s.id];
      if (m?.online) {
        online++;
        cpuSum += m.cpuPercent;
        ramSum += m.ramPercent;
      }
    }
    return {
      total,
      online,
      avgCpu: online > 0 ? (cpuSum / online).toFixed(1) : '0.0',
      avgRam: online > 0 ? (ramSum / online).toFixed(1) : '0.0',
    };
  }, [activeServers, metricsMap]);

  const translateHealthIssue = (code: string): string => {
    switch (code) {
      case 'high_cpu':
        return t.highCpu;
      case 'high_ram':
        return t.highRam;
      case 'low_disk':
        return t.lowDisk;
      case 'failed_services':
        return `${currentMetrics?.failedServices || 1} ${t.failedServices}`;
      default:
        return code;
    }
  };

  const selectedWallet =
    DONATION_WALLETS.find((w) => w.id === selectedWalletId) || DONATION_WALLETS[0];

  const processes = currentMetrics?.processes || [];
  const toggleProcSort = (key: ProcSortKey) => {
    setProcSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { key, dir: key === 'command' || key === 'pid' ? 'asc' : 'desc' }
    );
  };
  const sortedProcesses = useMemo(() => {
    const list = [...processes];
    const mul = procSort.dir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (procSort.key === 'command') return a.command.localeCompare(b.command) * mul;
      if (procSort.key === 'pid') return (a.pid - b.pid) * mul;
      if (procSort.key === 'mem') return (a.mem - b.mem) * mul;
      return (a.cpu - b.cpu) * mul;
    });
    return list;
  }, [processes, procSort]);
  const containers = currentMetrics?.containers || [];
  const openPorts = currentMetrics?.openPorts || [];

  const navTabs: { id: ServerTab; label: string; icon: React.ReactNode; badge?: number; proOnly?: boolean }[] = [
    { id: 'overview', label: t.tabOverview, icon: <Activity className="h-3.5 w-3.5" /> },
    { id: 'history', label: getHistoryStrings(settings.language).tabHistory, icon: <History className="h-3.5 w-3.5" /> },
    { id: 'security', label: getSecurityCronStrings(settings.language).tabLabel, icon: <ShieldCheck className="h-3.5 w-3.5" /> },
    { id: 'processes', label: t.tabProcesses, icon: <ListTree className="h-3.5 w-3.5" />, badge: processes.length },
    { id: 'docker', label: t.tabDocker, icon: <Box className="h-3.5 w-3.5" />, badge: containers.length },
    {
      id: 'services',
      label: t.tabServices,
      icon: <Server className="h-3.5 w-3.5" />,
      badge: (currentMetrics?.services || []).length,
    },
    {
      id: 'network',
      label: t.tabNetwork,
      icon: <Shield className="h-3.5 w-3.5" />,
      badge: openPorts.length,
      proOnly: true,
    },
    { id: 'files', label: getSftpStrings(settings.language).tabFiles, icon: <FolderOpen className="h-3.5 w-3.5" />, proOnly: true },
    { id: 'terminal', label: t.tabTerminal, icon: <Terminal className="h-3.5 w-3.5" />, proOnly: true },
  ];

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-[#090d16] text-slate-100 select-none">
      {/* Ambient Background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-indigo-600/15 blur-3xl" />
        <div className="absolute -bottom-32 right-0 h-[28rem] w-[28rem] rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      {/* SIDEBAR */}
      <aside className="relative z-20 flex w-72 shrink-0 flex-col border-e border-white/10 bg-slate-950/75 backdrop-blur-xl">
        {/* Brand */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 via-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-white">ZentraDeck</span>
                <button type="button" onClick={() => BrowserOpenURL('https://github.com/CyberRhythm/ZentraDeck/releases')} title="View releases on GitHub" className="cursor-pointer transition hover:border-cyan-400/50 hover:text-cyan-300 rounded-md border border-cyan-400/25 bg-cyan-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300">v0.4.1</button>
              </div>
              <p className="text-[11px] text-slate-400">{t.openSourceFree}</p>
            </div>
          </div>
        </div>

        {/* Demo Badge */}
        {demoMode && (
          <div className="mx-3 mt-3 flex items-center justify-between rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <span className="flex items-center gap-1.5 font-semibold">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              {t.demoBadge}
            </span>
            <button
              onClick={handleToggleDemo}
              className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-100 transition hover:bg-amber-500/35"
            >
              {t.exitDemo}
            </button>
          </div>
        )}

        {/* Fleet Overview Switch */}
        <div className="px-3 pt-3">
          <button
            onClick={() => setViewPage('fleet')}
            className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs font-semibold transition ${
              viewPage === 'fleet'
                ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200 shadow'
                : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07] hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-cyan-400" />
              {t.fleetOverview}
            </span>
            <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-200">
              {fleetStats.online}/{fleetStats.total}
            </span>
          </button>
        </div>

        {/* Server List Header */}
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {t.servers} ({activeServers.length})
          </span>
          <button
            onClick={handleOpenAddServer}
            className="flex items-center gap-1 rounded-lg bg-indigo-500/20 px-2.5 py-1 text-xs font-medium text-indigo-300 transition hover:bg-indigo-500/35 hover:text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            {t.addServer}
          </button>
        </div>

        {/* Server Items */}
        <div className="flex-1 space-y-1.5 overflow-y-auto px-3 py-1">
          {activeServers.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-center">
              <Server className="mx-auto mb-2 h-6 w-6 text-slate-500" />
              <p className="text-xs font-medium text-slate-300">{t.noServers}</p>
            </div>
          ) : (
            activeServers.map((srv) => {
              const m = metricsMap[srv.id];
              const isSelected = viewPage === 'server' && selectedServer?.id === srv.id;
              const isOnline = m?.online;
              return (
                <div
                  key={srv.id}
                  onClick={() => {
                    setSelectedId(srv.id);
                    setViewPage('server');
                  }}
                  className={`group relative cursor-pointer rounded-xl border p-3 transition-all ${
                    isSelected
                      ? 'border-cyan-400/40 bg-gradient-to-r from-indigo-500/20 to-cyan-500/10 shadow-md shadow-indigo-950/40'
                      : 'border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.05]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="relative flex h-2.5 w-2.5 shrink-0">
                        {isOnline && (
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                        )}
                        <span
                          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                            m === undefined
                              ? 'bg-slate-500'
                              : isOnline
                                ? 'bg-emerald-400'
                                : 'bg-rose-500'
                          }`}
                        />
                      </span>
                      <span className="truncate text-sm font-semibold text-white">{srv.name}</span>
                    </div>

                    {!srv.isDemo && (
                      <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                        <button
                          onClick={(e) => handleOpenEditServer(srv, e)}
                          title={t.editServer}
                          className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteServer(srv, e)}
                          title={t.deleteServer}
                          className="rounded-md p-1 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="truncate font-mono">
                      {maskText(srv.host, settings.privacyMode)}
                    </span>
                    <div className="flex items-center gap-1">
                      {ptyStatusMap[srv.id] === 'connected' && (
                        <span
                          title="Active PTY terminal session"
                          className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-400/25"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          PTY
                        </span>
                      )}
                      {srv.useProxy && (
                        <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300">
                          SOCKS5
                        </span>
                      )}
                      <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-300">
                        {srv.group}
                      </span>
                    </div>
                  </div>

                  {m?.online && (
                    <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px] text-slate-300">
                      <div className="rounded bg-slate-900/70 px-1.5 py-0.5 text-center">
                        CPU <span className="font-semibold text-cyan-300">{m.cpuPercent}%</span>
                      </div>
                      <div className="rounded bg-slate-900/70 px-1.5 py-0.5 text-center">
                        RAM <span className="font-semibold text-indigo-300">{m.ramPercent}%</span>
                      </div>
                      <div className="rounded bg-slate-900/70 px-1.5 py-0.5 text-center">
                        DSK <span className="font-semibold text-emerald-300">{m.diskPercent}%</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Actions */}
        <div className="space-y-1.5 border-t border-white/10 p-3">
          <button
            onClick={handleImportSSH}
            className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
          >
            <FileDown className="h-4 w-4 text-cyan-400" />
            <span className="truncate">{t.importSSH}</span>
            <span className="ms-auto"><HelpTip text={h.importSSH} /></span>
          </button>

          <button
            onClick={handleToggleDemo}
            className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-amber-400/30 hover:bg-amber-500/10 hover:text-amber-200"
          >
            <Sparkles className="h-4 w-4 text-amber-400" />
            <span className="truncate">{demoMode ? t.exitDemo : t.demoSandbox}</span>
          </button>

          <button
            onClick={() => setSupportModalOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-200 transition hover:border-rose-400/40 hover:bg-rose-500/20 hover:text-white"
          >
            <Heart className="h-3.5 w-3.5 fill-rose-400 text-rose-400" />
            <span>{t.supportProject}</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* TOP HEADER */}
        <header className="relative z-30 flex shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-slate-950/75 px-6 py-3.5 backdrop-blur-xl">
          <div className="min-w-0">
            {viewPage === 'fleet' ? (
              <div>
                <h1 className="flex items-center gap-2 text-lg font-bold text-white">{t.fleetOverview}<HelpTip text={h.fleetOverview} /></h1>
                <p className="mt-0.5 text-xs text-slate-400">
                  {fleetStats.online}/{fleetStats.total} {t.onlineServers} {DOT} {t.avgCpu}:{' '}
                  <span className="text-cyan-300">{fleetStats.avgCpu}%</span> {DOT} {t.avgRam}:{' '}
                  <span className="text-indigo-300">{fleetStats.avgRam}%</span>
                </p>
              </div>
            ) : selectedServer ? (
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="truncate text-lg font-bold text-white">{selectedServer.name}</h1>
                  <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-xs text-slate-300">
                    {settings.privacyMode
                      ? `user@${MASK_IP}`
                      : `${selectedServer.username}@${selectedServer.host}:${selectedServer.port}`}
                  </span>
                  {currentMetrics?.online ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                      <Wifi className="h-3 w-3" />
                      {t.online} {DOT} {currentMetrics.latencyMs} ms
                    </span>
                  ) : currentMetrics ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-500/15 px-2.5 py-0.5 text-xs font-medium text-rose-300">
                      <WifiOff className="h-3 w-3" />
                      {t.offline}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-500/30 bg-slate-500/15 px-2.5 py-0.5 text-xs text-slate-300">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      {t.connecting}
                    </span>
                  )}
                </div>
                {currentMetrics?.online && (
                  <p className="mt-0.5 truncate text-xs text-slate-400">
                    {currentMetrics.os || 'Linux'} {DOT} Kernel {currentMetrics.kernel || '-'} {DOT}{' '}
                    {t.uptime}: <span className="text-slate-200">{currentMetrics.uptime || '-'}</span>
                  </p>
                )}
              </div>
            ) : (
              <h1 className="text-lg font-bold text-white">ZentraDeck</h1>
            )}
          </div>

          {/* Right Controls */}
          <div className="flex shrink-0 items-center gap-2">
            {viewPage === 'server' && selectedServer?.isDemo && (
              <button
                onClick={handleToggleDemoOutage}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                  currentMetrics?.online === false
                    ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                    : 'border-rose-400/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20'
                }`}
              >
                <Power className="h-3.5 w-3.5" />
                {currentMetrics?.online === false ? t.restoreServer : t.simulateOutage}
              </button>
            )}

            {viewPage === 'server' && isPro && selectedServer && currentMetrics?.online && (
              <button
                onClick={handleRebootServer}
                title={t.rebootServer}
                className="flex items-center gap-1.5 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-500/20"
              >
                <RotateCw className="h-3.5 w-3.5" />
                {t.rebootServer}
              </button>
            )}

            {/* Simple / Pro Toggle */}
            <div className="flex rounded-xl border border-white/10 bg-slate-900/80 p-0.5 text-xs">
              <button
                onClick={() => updateSettings({ viewMode: 'simple' })}
                className={`rounded-lg px-3 py-1 font-medium transition ${
                  !isPro ? 'bg-indigo-500 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                {t.simpleMode}
              </button>
              <button
                onClick={() => updateSettings({ viewMode: 'pro' })}
                className={`rounded-lg px-3 py-1 font-medium transition ${
                  isPro ? 'bg-cyan-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                {t.proMode}
              </button>
            </div>

            {/* Privacy Toggle */}
            <button
              onClick={() => updateSettings({ privacyMode: !settings.privacyMode })}
              title={`${t.privacyMode} - ${h.privacyMode}`}
              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition ${
                settings.privacyMode
                  ? 'border-cyan-400/40 bg-cyan-500/20 text-cyan-200'
                  : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              {settings.privacyMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>

            {/* Alerts */}
            <div className="relative">
              <button
                onClick={() => {
                  setAlertsOpen((v) => !v);
                  setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
                }}
                className="relative flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                <Bell className="h-4 w-4" />
                {unreadAlerts > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                    {unreadAlerts}
                  </span>
                )}
              </button>

              {alertsOpen && (() => {
                return (
                <div className="absolute end-0 mt-2 w-80 rounded-2xl border border-white/15 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-xl">
                  <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="text-xs font-semibold text-white">{t.alerts}</span>
                    <div className="flex items-center gap-2">
                      {alerts.length > 0 && (
                        <button
                          onClick={() => setAlerts([])}
                          className="text-[11px] text-slate-400 hover:text-white"
                        >
                          {t.clearAlerts}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setAlertsOpen(false);
                          setSettingsTab('alerts');
                          setSettingsModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-cyan-400/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-200 transition hover:bg-cyan-500/20"
                      >
                        <Settings className="h-3 w-3" />
                        {getSettingsStrings(settings.language).alertSettingsLink}
                      </button>
                    </div>
                  </div>

                  <div className="max-h-60 space-y-1.5 overflow-y-auto">
                    {alerts.length === 0 ? (
                      <p className="py-4 text-center text-xs text-slate-400">{t.noAlerts}</p>
                    ) : (
                      alerts.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-start gap-2 rounded-xl border border-white/5 bg-white/[0.03] p-2 text-xs"
                        >
                          {a.type === 'recovered' ? (
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          ) : a.type === 'outage' ? (
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                          ) : (
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-white">{a.serverName}</p>
                            <p className="text-[11px] text-slate-400">
                              {a.type === 'outage'
                                ? t.outageDetected
                                : a.type === 'recovered'
                                  ? t.serverRecovered
                                  : a.detail || a.type}{' '}
                              {DOT} {a.time}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                );
              })()}
            </div>

            {/* Broadcast & Snippets Trigger */}
            <button
              type="button"
              onClick={() => {
                setAlertsOpen(false);
                setBroadcastOpen(true);
              }}
              title={getBroadcastStrings(settings.language).triggerBtn}
              className="flex items-center justify-center rounded-xl border border-indigo-400/25 bg-indigo-500/10 p-2 text-indigo-200 transition hover:border-indigo-400/45 hover:bg-indigo-500/20 hover:text-white"
            >
              <Radio className="h-4 w-4" />
            </button>

            {/* Settings Modal Trigger */}
            <button
              type="button"
              onClick={() => {
                setAlertsOpen(false);
                setSettingsTab('general');
                setSettingsModalOpen(true);
              }}
              title={getSettingsStrings(settings.language).settingsBtn}
              className="flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:border-cyan-400/30 hover:bg-white/10 hover:text-white"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* MAIN SCROLL AREA */}
        <main className="relative z-10 flex-1 overflow-y-auto p-6">
          {viewPage === 'fleet' ? (
            /* FLEET OVERVIEW GRID */
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-xl">
                  <span className="text-xs text-slate-400">{t.totalServers}</span>
                  <div className="mt-1 text-2xl font-bold text-white">{fleetStats.total}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-xl">
                  <span className="text-xs text-slate-400">{t.onlineServers}</span>
                  <div className="mt-1 text-2xl font-bold text-emerald-400">
                    {fleetStats.online} / {fleetStats.total}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-xl">
                  <span className="text-xs text-slate-400">{t.avgCpu}</span>
                  <div className="mt-1 text-2xl font-bold text-cyan-300">{fleetStats.avgCpu}%</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-xl">
                  <span className="text-xs text-slate-400">{t.avgRam}</span>
                  <div className="mt-1 text-2xl font-bold text-indigo-300">{fleetStats.avgRam}%</div>
                </div>
              </div>

              {activeServers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-slate-900/40 p-10 text-center">
                  <p className="text-sm text-slate-400">{t.noServers}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {activeServers.map((srv) => {
                    const m = metricsMap[srv.id];
                    return (
                      <div
                        key={srv.id}
                        onClick={() => {
                          setSelectedId(srv.id);
                          setViewPage('server');
                        }}
                        className="cursor-pointer rounded-2xl border border-white/10 bg-slate-900/65 p-5 transition hover:border-cyan-400/40 hover:bg-slate-900/90"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span
                              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                                m === undefined
                                  ? 'bg-slate-500'
                                  : m.online
                                    ? 'bg-emerald-400'
                                    : 'bg-rose-500'
                              }`}
                            />
                            <h3 className="truncate text-base font-bold text-white">{srv.name}</h3>
                          </div>
                          {m?.online && (
                            <span
                              className="rounded-lg px-2 py-0.5 text-xs font-bold"
                              style={{
                                color: getScoreColor(m.healthScore),
                                backgroundColor: 'rgba(255,255,255,0.06)',
                              }}
                            >
                              {m.healthScore}
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                          <span className="font-mono">{maskText(srv.host, settings.privacyMode)}</span>
                          <span>{m?.online ? `${m.latencyMs} ms` : m ? t.offline : t.connecting}</span>
                        </div>

                        {m?.online ? (
                          <div className="mt-4 space-y-2.5 text-xs">
                            {[
                              { label: 'CPU', val: m.cpuPercent },
                              { label: 'RAM', val: m.ramPercent },
                              { label: 'DISK', val: m.diskPercent },
                            ].map((bar) => (
                              <div key={bar.label}>
                                <div className="mb-1 flex justify-between text-[11px]">
                                  <span className="text-slate-400">{bar.label}</span>
                                  <span className="font-mono font-semibold text-slate-200">{bar.val}%</span>
                                </div>
                                <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                                  <div
                                    className={`h-full rounded-full bg-gradient-to-r ${getBarColor(bar.val)}`}
                                    style={{ width: `${Math.min(100, bar.val)}%` }}
                                  />
                                </div>
                              </div>
                            ))}

                            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-2.5 text-[11px] text-slate-400">
                              <span>
                                {t.uptime}: <strong className="text-slate-200">{m.uptime || '-'}</strong>
                              </span>
                              <div className="flex items-center gap-2">
                                {m.dockerAvailable && (
                                  <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-sky-300">
                                    Docker: {(m.containers || []).length}
                                  </span>
                                )}
                                <span
                                  className={`rounded px-1.5 py-0.5 ${
                                    m.firewallStatus === 'active'
                                      ? 'bg-emerald-500/15 text-emerald-300'
                                      : 'bg-white/5 text-slate-400'
                                  }`}
                                >
                                  FW: {m.firewallStatus}
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          m?.error ? (() => {
                            const fe = explainConnectionError(m.error, lang, !!settings.privacyMode);
                            return (
                              <div className="mt-4 space-y-1 rounded-xl border border-rose-500/15 bg-slate-950/60 p-3 text-xs">
                                <p className="font-semibold text-rose-200">{fe.title}</p>
                                <p className="text-[11px] leading-relaxed text-slate-400">{fe.hint}</p>
                              </div>
                            );
                          })() : (
                            <p className="mt-4 rounded-xl bg-slate-950/60 p-3 text-xs text-slate-400">
                              {t.connecting}
                            </p>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : !selectedServer ? (
            /* EMPTY STATE */
            <div className="mx-auto mt-16 max-w-xl rounded-3xl border border-white/10 bg-slate-900/60 p-10 text-center shadow-2xl backdrop-blur-xl">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-indigo-600 shadow-lg shadow-indigo-500/30">
                <Server className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white">{t.noServers}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{t.noServersDesc}</p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={handleOpenAddServer}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-110"
                >
                  <Plus className="h-4 w-4" />
                  {t.addServer}
                </button>
                <button
                  onClick={handleImportSSH}
                  className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10"
                >
                  <FileDown className="h-4 w-4 text-cyan-400" />
                  {t.importSSH}
                </button>
                <button
                  onClick={handleToggleDemo}
                  className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-200 transition hover:bg-amber-500/20"
                >
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  {t.tryDemoNow}
                </button>
              </div>
            </div>
          ) : currentMetrics && !currentMetrics.online ? (
            /* OFFLINE CARD */
            <div className="mx-auto mt-10 max-w-2xl rounded-3xl border border-rose-500/30 bg-rose-950/25 p-8 backdrop-blur-xl">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400">
                  <WifiOff className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold text-rose-200">{t.serverOfflineTitle}</h2>
                  <p className="mt-1 text-sm text-rose-200/75">{t.serverOfflineDesc}</p>
                  {currentMetrics.error && (() => {
                    const fe = explainConnectionError(currentMetrics.error, lang, !!settings.privacyMode);
                    return (
                      <div className="mt-4 space-y-2.5 text-start">
                        <div className="rounded-xl border border-rose-400/25 bg-slate-950/70 p-3.5">
                          <p className="text-sm font-semibold text-rose-200">{fe.title}</p>
                          <p className="mt-1 text-xs leading-relaxed text-slate-300">{fe.hint}</p>
                        </div>
                        <details className="rounded-xl border border-white/10 bg-slate-950/50 px-3.5 py-2 text-xs">
                          <summary className="cursor-pointer select-none text-[11px] font-medium text-slate-400 hover:text-slate-200">
                            {getErrorTechLabel(lang)}
                          </summary>
                          <pre dir="ltr" className="mt-2 overflow-x-auto font-mono text-[11px] text-rose-300/90">
                            {fe.technical}
                          </pre>
                        </details>
                      </div>
                    );
                  })()}
                  {selectedServer.isDemo && (
                    <button
                      onClick={handleToggleDemoOutage}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/30"
                    >
                      <Power className="h-4 w-4" />
                      {t.restoreServer}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* SERVER DETAIL VIEW */
            <div className="space-y-5">
              {/* Tab Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-white/10 bg-slate-900/70 p-1.5 backdrop-blur-xl">
                  {navTabs
                    .filter((tab) => !tab.proOnly || isPro)
                    .map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                          activeTab === tab.id
                            ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow'
                            : 'text-slate-400 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        {tab.icon}
                        <span>{tab.label}</span>
                        {typeof tab.badge === 'number' && tab.badge > 0 && (
                          <span
                            className={`rounded-md px-1.5 py-0.2 text-[10px] ${
                              activeTab === tab.id
                                ? 'bg-white/20 text-white'
                                : 'bg-white/5 text-slate-400'
                            }`}
                          >
                            {tab.badge}
                          </span>
                        )}
                      </button>
                    ))}
                </div>

                {!isPro && (
                  <button
                    onClick={() => updateSettings({ viewMode: 'pro' })}
                    className="hidden items-center gap-1.5 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-medium text-cyan-200 transition hover:bg-cyan-500/20 xl:flex"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                    {t.simpleTip}
                  </button>
                )}
              </div>

              {/* TAB 1: OVERVIEW */}
              {activeTab === 'history' && selectedServer && (
                <Suspense fallback={null}><HistoryPanel
                  serverId={selectedServer.id}
                  serverName={selectedServer.name}
                  isDemo={!!selectedServer.isDemo}
                  language={settings.language}
                  privacyMode={!!settings.privacyMode}
                  reportFormat={settings.reportExportFormat || 'md'}
                  onToast={(type, message) => pushToast(type, message)}
                /></Suspense>
              )}

              {activeTab === 'security' && selectedServer && (
                <Suspense fallback={null}><SecurityCronPanel
                  serverId={selectedServer.id}
                  language={settings.language}
                  onToast={(type, message) => pushToast(type, message)}
                /></Suspense>
              )}

              {activeTab === 'overview' && (
                <div className="space-y-5">
                  {/* Health Banner */}
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-xl">
                    <div className="flex items-center gap-4">
                      <div className="relative flex h-14 w-14 items-center justify-center">
                        <svg className="h-14 w-14 -rotate-90" viewBox="0 0 36 36">
                          <path
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke="rgba(148,163,184,0.18)"
                            strokeWidth="3.2"
                          />
                          <path
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke={getScoreColor(currentMetrics?.healthScore ?? 100)}
                            strokeWidth="3.2"
                            strokeDasharray={`${currentMetrics?.healthScore ?? 100}, 100`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <span className="absolute text-sm font-bold text-white">
                          {currentMetrics?.healthScore ?? '--'}
                        </span>
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                            {t.healthScore}
                          </span>
                          <Shield className="h-3.5 w-3.5 text-emerald-400" />
                          <HelpTip text={h.healthScore} />
                        </div>
                        {currentMetrics && (currentMetrics.healthIssues?.length || 0) > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {currentMetrics.healthIssues.map((issue) => (
                              <span
                                key={issue}
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-400/30 bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-200"
                              >
                                <AlertTriangle className="h-3 w-3" />
                                {translateHealthIssue(issue)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-0.5 text-sm font-medium text-emerald-300">{t.allHealthy}</p>
                        )}
                      </div>
                    </div>

                    {isPro && currentMetrics && (
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <div className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2">
                          <span className="flex items-center gap-1.5 text-[10px] uppercase text-slate-400">{t.loadAvg}<HelpTip text={h.loadAvg} /></span>
                          <span className="font-mono font-semibold text-cyan-300">
                            {currentMetrics.load1.toFixed(2)} / {currentMetrics.load5.toFixed(2)} /{' '}
                            {currentMetrics.load15.toFixed(2)}
                          </span>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2">
                          <span className="flex items-center gap-1.5 text-[10px] uppercase text-slate-400">{t.swapUsage}<HelpTip text={h.swapUsage} /></span>
                          <span className="font-mono font-semibold text-indigo-300">
                            {currentMetrics.swapUsedGB} / {currentMetrics.swapTotalGB} GB (
                            {currentMetrics.swapPercent}%)
                          </span>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2">
                          <span className="flex items-center gap-1.5 text-[10px] uppercase text-slate-400">{t.firewall}<HelpTip text={h.firewall} /></span>
                          <span
                            className={`font-semibold ${
                              currentMetrics.firewallStatus === 'active'
                                ? 'text-emerald-300'
                                : currentMetrics.firewallStatus === 'inactive'
                                  ? 'text-amber-300'
                                  : 'text-slate-400'
                            }`}
                          >
                            {currentMetrics.firewallStatus === 'active'
                              ? t.fwActive
                              : currentMetrics.firewallStatus === 'inactive'
                                ? t.fwInactive
                                : t.fwUnknown}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 4 KPI Cards */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-xl">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-400">{t.cpuUsage}<HelpTip text={h.cpuUsage} /></span>
                        <Cpu className="h-4 w-4 text-cyan-400" />
                      </div>
                      <div className="mt-2 flex items-baseline justify-between">
                        <span className="text-2xl font-bold text-white">
                          {currentMetrics ? `${currentMetrics.cpuPercent}%` : '--'}
                        </span>
                        <span className="text-xs text-slate-400">
                          {currentMetrics?.cpuCores || 1} {t.cores}
                        </span>
                      </div>
                      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${getBarColor(
                            currentMetrics?.cpuPercent || 0
                          )}`}
                          style={{ width: `${Math.min(100, currentMetrics?.cpuPercent || 0)}%` }}
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-xl">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-400">{t.ramUsage}<HelpTip text={h.ramUsage} /></span>
                        <MemoryStick className="h-4 w-4 text-indigo-400" />
                      </div>
                      <div className="mt-2 flex items-baseline justify-between">
                        <span className="text-2xl font-bold text-white">
                          {currentMetrics ? `${currentMetrics.ramPercent}%` : '--'}
                        </span>
                        <span className="text-xs text-slate-400">
                          {currentMetrics
                            ? `${currentMetrics.ramUsedGB} / ${currentMetrics.ramTotalGB} GB`
                            : '--'}
                        </span>
                      </div>
                      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${getBarColor(
                            currentMetrics?.ramPercent || 0
                          )}`}
                          style={{ width: `${Math.min(100, currentMetrics?.ramPercent || 0)}%` }}
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-xl">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-400">{t.diskUsage}<HelpTip text={h.diskUsage} /></span>
                        <HardDrive className="h-4 w-4 text-emerald-400" />
                      </div>
                      <div className="mt-2 flex items-baseline justify-between">
                        <span className="text-2xl font-bold text-white">
                          {currentMetrics ? `${currentMetrics.diskPercent}%` : '--'}
                        </span>
                        <span className="text-xs text-slate-400">
                          {currentMetrics
                            ? `${currentMetrics.diskUsedGB} / ${currentMetrics.diskTotalGB} GB`
                            : '--'}
                        </span>
                      </div>
                      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${getBarColor(
                            currentMetrics?.diskPercent || 0
                          )}`}
                          style={{ width: `${Math.min(100, currentMetrics?.diskPercent || 0)}%` }}
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-xl">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-400">{t.networkTraffic}<HelpTip text={h.networkTraffic} /></span>
                        <Network className="h-4 w-4 text-violet-400" />
                      </div>
                      <div className="mt-2.5 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 text-slate-400">
                            <Download className="h-3.5 w-3.5 text-emerald-400" />
                            {t.download}
                          </span>
                          <span className="font-mono font-semibold text-emerald-300">
                            {formatRate(currentMetrics?.netRxKBps || 0)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 text-slate-400">
                            <Upload className="h-3.5 w-3.5 text-sky-400" />
                            {t.upload}
                          </span>
                          <span className="font-mono font-semibold text-sky-300">
                            {formatRate(currentMetrics?.netTxKBps || 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Charts */}
                  <div className={`grid grid-cols-1 gap-4 ${isPro ? 'xl:grid-cols-2' : ''}`}>
                    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-xl">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-white">
                          {t.liveChart} {DASH} CPU & RAM (%)
                        </h3>
                        <div className="flex items-center gap-3 text-[11px]">
                          <span className="flex items-center gap-1.5 text-cyan-300">
                            <span className="h-2 w-2 rounded-full bg-cyan-400" /> CPU
                          </span>
                          <span className="flex items-center gap-1.5 text-indigo-300">
                            <span className="h-2 w-2 rounded-full bg-indigo-400" /> RAM
                          </span>
                        </div>
                      </div>
                      <div className="h-56 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={currentHistory}>
                            <defs>
                              <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.35} />
                                <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="ramGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#818cf8" stopOpacity={0.35} />
                                <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                            <XAxis dataKey="time" stroke="#64748b" fontSize={10} tickLine={false} />
                            <YAxis domain={[0, 100]} stroke="#64748b" fontSize={10} tickLine={false} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#0f172a',
                                border: '1px solid rgba(255,255,255,0.12)',
                                borderRadius: '12px',
                                fontSize: '12px',
                              }}
                              formatter={(val: unknown) => [`${Number(val ?? 0).toFixed(1)}%`]}
                            />
                            <Area
                              type="monotone"
                              dataKey="cpu"
                              name="CPU"
                              stroke="#22d3ee"
                              strokeWidth={2}
                              fill="url(#cpuGrad)"
                              isAnimationActive={false}
                            />
                            <Area
                              type="monotone"
                              dataKey="ram"
                              name="RAM"
                              stroke="#818cf8"
                              strokeWidth={2}
                              fill="url(#ramGrad)"
                              isAnimationActive={false}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {isPro && (
                      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-xl">
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-white">
                            {t.networkTraffic} (KB/s)
                          </h3>
                          <div className="flex items-center gap-3 text-[11px]">
                            <span className="flex items-center gap-1.5 text-emerald-300">
                              <span className="h-2 w-2 rounded-full bg-emerald-400" /> {t.download}
                            </span>
                            <span className="flex items-center gap-1.5 text-sky-300">
                              <span className="h-2 w-2 rounded-full bg-sky-400" /> {t.upload}
                            </span>
                          </div>
                        </div>
                        <div className="h-56 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={currentHistory}>
                              <defs>
                                <linearGradient id="rxGrad" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#34d399" stopOpacity={0.35} />
                                  <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="txGrad" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35} />
                                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                              <XAxis dataKey="time" stroke="#64748b" fontSize={10} tickLine={false} />
                              <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: '#0f172a',
                                  border: '1px solid rgba(255,255,255,0.12)',
                                  borderRadius: '12px',
                                  fontSize: '12px',
                                }}
                                formatter={(val: unknown) => [formatRate(Number(val ?? 0))]}
                              />
                              <Area
                                type="monotone"
                                dataKey="rx"
                                name={t.download}
                                stroke="#34d399"
                                strokeWidth={2}
                                fill="url(#rxGrad)"
                                isAnimationActive={false}
                              />
                              <Area
                                type="monotone"
                                dataKey="tx"
                                name={t.upload}
                                stroke="#38bdf8"
                                strokeWidth={2}
                                fill="url(#txGrad)"
                                isAnimationActive={false}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Storage Partitions (Pro) or Top 5 Processes Preview (Simple) */}
                  {isPro ? (
                    currentMetrics &&
                    currentMetrics.disks &&
                    currentMetrics.disks.length > 0 && (
                      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-xl">
                        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">{t.storagePartitions}<HelpTip text={h.storagePartitions} /></h3>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {currentMetrics.disks.map((d) => (
                            <div
                              key={d.mount}
                              className="rounded-xl border border-white/5 bg-slate-950/60 p-3"
                            >
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-mono font-semibold text-cyan-300">{d.mount}</span>
                                <span className="text-slate-300">
                                  {d.usedGB} / {d.totalGB} GB ({d.percent}%)
                                </span>
                              </div>
                              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                                <div
                                  className={`h-full rounded-full bg-gradient-to-r ${getBarColor(d.percent)}`}
                                  style={{ width: `${Math.min(100, d.percent)}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-xl">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                          <ListTree className="h-4 w-4 text-cyan-400" />
                          {t.topProcesses}
                          <HelpTip text={h.processes} />
                        </h3>
                        <button
                          onClick={() => setActiveTab('processes')}
                          className="text-xs font-medium text-cyan-300 hover:underline"
                        >
                          {t.all} ({processes.length})
                        </button>
                      </div>
                      {processes.length === 0 ? (
                        <p className="py-4 text-center text-xs text-slate-400">{t.noProcesses}</p>
                      ) : (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                          {processes.slice(0, 5).map((p) => (
                            <div
                              key={p.pid}
                              className="rounded-xl border border-white/5 bg-slate-950/60 p-3 text-xs"
                            >
                              <div className="truncate font-mono font-semibold text-white">{p.command}</div>
                              <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                                <span>
                                  CPU <strong className="text-cyan-300">{p.cpu}%</strong>
                                </span>
                                <span>
                                  RAM <strong className="text-indigo-300">{p.mem}%</strong>
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: PROCESSES (TASK MANAGER) */}
              {activeTab === 'processes' && (
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-xl">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <ListTree className="h-4 w-4 text-cyan-400" />
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-white">{t.topProcesses}<HelpTip text={h.processes} /></h3>
                      <span className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-slate-400">
                        {sortedProcesses.length}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="me-1 text-slate-400">{t.sortBy}:</span>
                      {(
                        [
                          { key: 'cpu', label: 'CPU %' },
                          { key: 'mem', label: 'RAM %' },
                          { key: 'pid', label: t.pid },
                          { key: 'command', label: t.command },
                        ] as { key: ProcSortKey; label: string }[]
                      ).map((opt) => {
                        const active = procSort.key === opt.key;
                        return (
                          <button
                            key={opt.key}
                            onClick={() => toggleProcSort(opt.key)}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 font-medium transition ${
                              active
                                ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200'
                                : 'border-white/10 bg-slate-950/60 text-slate-400 hover:text-white'
                            }`}
                          >
                            {opt.label}
                            {active ? (
                              procSort.dir === 'desc' ? (
                                <ArrowDown className="h-3 w-3" />
                              ) : (
                                <ArrowUp className="h-3 w-3" />
                              )
                            ) : (
                              <ArrowUpDown className="h-3 w-3 opacity-50" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {sortedProcesses.length === 0 ? (
                    <p className="py-10 text-center text-xs text-slate-400">{t.noProcesses}</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-start text-xs">
                        <thead>
                          <tr className="border-b border-white/10 text-[11px] uppercase text-slate-400">
                            <th
                              onClick={() => toggleProcSort('pid')}
                              className="cursor-pointer px-3 pb-2.5 text-start hover:text-white"
                            >
                              {t.pid}
                            </th>
                            <th
                              onClick={() => toggleProcSort('command')}
                              className="cursor-pointer px-3 pb-2.5 text-start hover:text-white"
                            >
                              {t.command}
                            </th>
                            <th className="px-3 pb-2.5 text-start">{t.user}</th>
                            <th
                              onClick={() => toggleProcSort('cpu')}
                              className="cursor-pointer px-3 pb-2.5 text-start hover:text-cyan-300"
                            >
                              CPU %
                            </th>
                            <th
                              onClick={() => toggleProcSort('mem')}
                              className="cursor-pointer px-3 pb-2.5 text-start hover:text-indigo-300"
                            >
                              RAM %
                            </th>
                            {isPro && <th className="px-3 pb-2.5 text-end">Action</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {sortedProcesses.map((proc) => {
                            const procDesc = describeProcess(proc.command, lang);
                            return (
                            <tr key={proc.pid} className="hover:bg-white/[0.02]">
                              <td className="whitespace-nowrap px-3 py-2.5 font-mono text-slate-400">
                                <span dir="ltr" className="inline-block">{proc.pid}</span>
                              </td>
                              <td className="max-w-xs px-3 py-2.5" title={procDesc || proc.command}>
                                <div className="truncate font-mono font-semibold text-white">
                                  <span dir="ltr" className="inline-block">{proc.command}</span>
                                </div>
                                {procDesc && (
                                  <div className="mt-0.5 truncate text-[10px] text-slate-400">{procDesc}</div>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2.5 text-slate-300">
                                <span dir="ltr" className="inline-block rounded bg-white/5 px-1.5 py-0.5 font-mono text-[11px]">{proc.user}</span>
                              </td>
                              <td className="whitespace-nowrap px-3 py-2.5 font-mono font-semibold text-cyan-300">
                                <span dir="ltr" className="inline-block">{proc.cpu.toFixed(1)}%</span>
                              </td>
                              <td className="whitespace-nowrap px-3 py-2.5 font-mono font-semibold text-indigo-300">
                                <span dir="ltr" className="inline-block">{proc.mem.toFixed(1)}%</span>
                              </td>
                              {isPro && (
                                <td className="whitespace-nowrap px-3 py-2.5 text-end">
                                  <div className="inline-flex items-center gap-1.5">
                                    <button
                                      disabled={busyAction !== null}
                                      onClick={() => handleKillProcess(proc, false)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-200 transition hover:bg-amber-500/25 disabled:opacity-50"
                                    >
                                      <Square className="h-3 w-3" />
                                      {t.kill}
                                    </button>
                                    <button
                                      disabled={busyAction !== null}
                                      onClick={() => handleKillProcess(proc, true)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-rose-400/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-200 transition hover:bg-rose-500/25 disabled:opacity-50"
                                    >
                                      <Skull className="h-3 w-3" />
                                      {t.forceKill}
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

                            {/* TAB 3: DOCKER CONTAINERS */}
              {activeTab === 'docker' && (
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-xl">
                  <div className="mb-4 flex items-center gap-2">
                    <Box className="h-4 w-4 text-sky-400" />
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-white">{t.dockerContainers}<HelpTip text={h.docker} /></h3>
                    <span className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-slate-400">
                      {containers.length}
                    </span>
                  </div>

                  {!currentMetrics?.dockerAvailable ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/50 py-10 text-center">
                      <Box className="mx-auto mb-2 h-8 w-8 text-slate-500" />
                      <p className="text-xs text-slate-400">{t.dockerNotInstalled}</p>
                    </div>
                  ) : containers.length === 0 ? (
                    <p className="py-10 text-center text-xs text-slate-400">{t.noContainers}</p>
                  ) : (
                    <div className="space-y-2.5">
                      {containers.map((c) => {
                        const isRunning = c.state === 'running';
                        return (
                          <div
                            key={c.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/60 p-3.5 text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                                    isRunning ? 'bg-emerald-400' : 'bg-slate-500'
                                  }`}
                                />
                                <span className="font-mono text-sm font-bold text-white">{c.name}</span>
                                <span
                                  className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                                    isRunning
                                      ? 'bg-emerald-500/15 text-emerald-300'
                                      : 'bg-slate-700/60 text-slate-300'
                                  }`}
                                >
                                  {isRunning ? t.running : t.stopped}
                                </span>
                                <span className="font-mono text-[11px] text-slate-500">
                                  {c.id.slice(0, 12)}
                                </span>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-3 ps-4 text-[11px] text-slate-400">
                                <span>
                                  {t.containerImage}:{' '}
                                  <strong className="font-mono text-cyan-200">{c.image}</strong>
                                </span>
                                <span>{c.status}</span>
                                {c.ports && (
                                  <span className="font-mono text-indigo-300">{c.ports}</span>
                                )}
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-1.5">
                              {!isRunning && (
                                <button
                                  disabled={busyAction !== null}
                                  onClick={() => handleDockerAction(c.id, 'start')}
                                  className="flex items-center gap-1 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-50"
                                >
                                  <Play className="h-3 w-3" />
                                  {t.start}
                                </button>
                              )}
                              <button
                                disabled={busyAction !== null}
                                onClick={() => handleDockerAction(c.id, 'restart')}
                                className="flex items-center gap-1 rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-200 transition hover:bg-cyan-500/25 disabled:opacity-50"
                              >
                                <RotateCw
                                  className={`h-3 w-3 ${
                                    busyAction === `dkr:${c.id}:restart` ? 'animate-spin' : ''
                                  }`}
                                />
                                {t.restart}
                              </button>
                              {isRunning && (
                                <button
                                  disabled={busyAction !== null}
                                  onClick={() => handleDockerAction(c.id, 'stop')}
                                  className="flex items-center gap-1 rounded-lg border border-rose-400/25 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-200 transition hover:bg-rose-500/25 disabled:opacity-50"
                                >
                                  <Square className="h-3 w-3" />
                                  {t.stop}
                                </button>
                              )}
                              {isRunning && (
                                <button
                                  onClick={() => handleOpenDockerShell({ id: c.id, name: c.name })}
                                  className="flex items-center gap-1 rounded-lg border border-indigo-400/30 bg-indigo-500/15 px-2.5 py-1 text-[11px] font-semibold text-indigo-200 transition hover:bg-indigo-500/30"
                                >
                                  <Terminal className="h-3 w-3" />
                                  {getPtyStrings(settings.language).shellBtn}
                                </button>
                              )}
                              <button
                                onClick={() => handleOpenLogs('docker', c.id, c.name)}
                                className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition hover:bg-white/15 hover:text-white"
                              >
                                <Terminal className="h-3 w-3" />
                                {t.logs}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: SYSTEMD SERVICES */}
              {activeTab === 'services' && (
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-xl">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4 text-cyan-400" />
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-white">{t.systemdServices}<HelpTip text={h.services} /></h3>
                      <span className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-slate-400">
                        {filteredServices.length}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={serviceSearch}
                          onChange={(e) => setServiceSearch(e.target.value)}
                          placeholder={t.searchServices}
                          className="w-44 rounded-xl border border-white/10 bg-slate-950/70 py-1.5 ps-8 pe-3 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-400/50"
                        />
                      </div>

                      <div className="flex rounded-xl border border-white/10 bg-slate-950/70 p-0.5 text-[11px]">
                        {(['all', 'active', 'failed', 'inactive'] as const).map((f) => (
                          <button
                            key={f}
                            onClick={() => setServiceFilter(f)}
                            className={`rounded-lg px-2.5 py-1 capitalize transition ${
                              serviceFilter === f
                                ? 'bg-white/15 font-semibold text-white'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {t[f]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {filteredServices.length === 0 ? (
                    <p className="py-8 text-center text-xs text-slate-400">{t.noServices}</p>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {filteredServices.map((svc) => {
                        const isActive = svc.status === 'active';
                        const isFailed = svc.status === 'failed';
                        return (
                          <div
                            key={svc.name}
                            className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-xs transition hover:bg-white/[0.02]"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`h-2 w-2 shrink-0 rounded-full ${
                                    isActive
                                      ? 'bg-emerald-400'
                                      : isFailed
                                        ? 'bg-rose-500'
                                        : 'bg-slate-500'
                                  }`}
                                />
                                <span className="truncate font-mono font-semibold text-slate-100">
                                  {svc.name}
                                </span>
                                <span
                                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                                    isActive
                                      ? 'bg-emerald-500/15 text-emerald-300'
                                      : isFailed
                                        ? 'bg-rose-500/20 text-rose-300'
                                        : 'bg-slate-700/60 text-slate-300'
                                  }`}
                                >
                                  {svc.status} ({svc.subState})
                                </span>
                              </div>
                              {(() => {
                                const locDesc = describeService(svc.name, svc.description, lang);
                                return locDesc ? (
                                  <p className="mt-0.5 truncate ps-4 text-[11px] text-slate-400" title={svc.description || locDesc}>
                                    {locDesc}
                                  </p>
                                ) : null;
                              })()}
                            </div>

                            <div className="flex shrink-0 items-center gap-1.5">
                              {!isActive && (
                                <button
                                  disabled={busyAction !== null}
                                  onClick={() => handleServiceAction(svc.name, 'start')}
                                  className="flex items-center gap-1 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-50"
                                >
                                  <Play className="h-3 w-3" />
                                  {t.start}
                                </button>
                              )}
                              <button
                                disabled={busyAction !== null}
                                onClick={() => handleServiceAction(svc.name, 'restart')}
                                className="flex items-center gap-1 rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-200 transition hover:bg-cyan-500/25 disabled:opacity-50"
                              >
                                <RotateCw
                                  className={`h-3 w-3 ${
                                    busyAction === `svc:${svc.name}:restart` ? 'animate-spin' : ''
                                  }`}
                                />
                                {t.restart}
                              </button>
                              {isActive && (
                                <button
                                  disabled={busyAction !== null}
                                  onClick={() => handleServiceAction(svc.name, 'stop')}
                                  className="flex items-center gap-1 rounded-lg border border-rose-400/25 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-200 transition hover:bg-rose-500/25 disabled:opacity-50"
                                >
                                  <Square className="h-3 w-3" />
                                  {t.stop}
                                </button>
                              )}
                              <button
                                onClick={() => handleOpenLogs('service', svc.name, svc.name)}
                                className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition hover:bg-white/15 hover:text-white"
                              >
                                <Terminal className="h-3 w-3" />
                                {t.logs}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: PORTS & FIREWALL (PRO) */}
              {activeTab === 'network' && isPro && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-xl">
                    <div className="flex items-center gap-3">
                      {currentMetrics?.firewallStatus === 'active' ? (
                        <ShieldCheck className="h-8 w-8 text-emerald-400" />
                      ) : (
                        <ShieldAlert className="h-8 w-8 text-amber-400" />
                      )}
                      <div>
                        <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-slate-400">
                          {t.firewall}
                          <HelpTip text={h.firewall} />
                        </div>
                        <div className="text-base font-bold text-white">
                          {currentMetrics?.firewallStatus === 'active'
                            ? t.fwActive
                            : currentMetrics?.firewallStatus === 'inactive'
                              ? t.fwInactive
                              : t.fwUnknown}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-xl">
                    <div className="mb-3 flex items-center gap-2">
                      <Network className="h-4 w-4 text-cyan-400" />
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-white">{t.openPorts}<HelpTip text={h.openPorts} /></h3>
                      <span className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-slate-400">
                        {openPorts.length}
                      </span>
                    </div>

                    {openPorts.length === 0 ? (
                      <p className="py-8 text-center text-xs text-slate-400">{t.noOpenPorts}</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-start text-xs">
                          <thead>
                            <tr className="border-b border-white/10 text-[11px] uppercase text-slate-400">
                              <th className="pb-2.5 pe-4">{t.protocol}</th>
                              <th className="pb-2.5 pe-4">{t.port}</th>
                              <th className="pb-2.5 pe-4">{t.address}</th>
                              <th className="pb-2.5">{t.processName}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {openPorts.map((item, idx) => (
                              <tr key={`${item.proto}-${item.address}-${item.port}-${idx}`}>
                                <td className="py-2 pe-4">
                                  <span className="rounded bg-indigo-500/20 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-indigo-300">
                                    {item.proto}
                                  </span>
                                </td>
                                <td className="py-2 pe-4 font-mono font-bold text-cyan-300">
                                  {item.port}
                                </td>
                                <td className="py-2 pe-4 font-mono text-slate-300">
                                  {settings.privacyMode && item.address !== '127.0.0.1' && item.address !== '0.0.0.0'
                                    ? MASK_IP
                                    : item.address}
                                </td>
                                <td className="py-2 font-mono text-emerald-300">
                                  {item.process || '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 6: SFTP FILE MANAGER & QUICK EDITOR (PRO) */}
              {isPro && selectedServer && (activeTab === 'files' || sftpMounted) && (
                <div className={activeTab === 'files' ? 'block' : 'hidden'}>
                  <SftpManager
                    serverId={selectedServer.id}
                    serverName={selectedServer.name}
                    language={settings.language}
                    onToast={pushToast}
                   autoBackupEnabled={!!settings.sftpAutoBackup} onOpenSettings={() => { setSettingsTab('sftp'); setSettingsModalOpen(true); }} />
                </div>
              )}

              {/* TAB 6: QUICK TERMINAL (PRO) */}
              {isPro && (activeTab === 'terminal' || mountedPtyIds.length > 0) && (
                <div
                  className={`${
                    activeTab === 'terminal' ? 'flex' : 'hidden'
                  } flex-col rounded-2xl border border-white/10 bg-slate-900/85 p-4`}
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <div className="flex items-center gap-2">
                        <Terminal className="h-4 w-4 text-emerald-400" />
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">{t.quickTerminal}<HelpTip text={h.terminal} /></h3>
                      </div>
                      <div className="inline-flex rounded-xl border border-white/10 bg-slate-950/70 p-0.5 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setTermMode('pty')}
                          className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                            termMode === 'pty'
                              ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/35'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {getPtyStrings(settings.language).interactivePty}
                        </button>
                        <button
                          type="button"
                          onClick={() => setTermMode('quick')}
                          className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                            termMode === 'quick'
                              ? 'bg-indigo-500/25 text-indigo-200 ring-1 ring-indigo-400/35'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {getPtyStrings(settings.language).quickRunner}
                        </button>
                      </div>
                    </div>
                    {termMode === 'quick' && (
                      <div className="flex items-center gap-2">
                        {cmdRunning && (
                          <button
                            onClick={handleStopCommand}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/35 bg-rose-500/15 px-3 py-1 text-[11px] font-semibold text-rose-200 transition hover:bg-rose-500/30"
                          >
                            <Square className="h-3 w-3 fill-rose-300" />
                            {t.stopCmd}
                          </button>
                        )}
                        {currentTerminal.length > 0 && selectedServer && (
                          <button
                            onClick={() =>
                              setTerminalMap((prev) => ({ ...prev, [selectedServer.id]: [] }))
                            }
                            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-white/10"
                          >
                            {t.clearOutput}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {mountedPtyIds.map((pid) => {
                    const srv = activeServers.find((s) => s.id === pid);
                    if (!srv) return null;
                    const visible =
                      activeTab === 'terminal' && termMode === 'pty' && selectedServer?.id === pid;
                    return (
                      <div key={pid} className={visible ? 'block' : 'hidden'}>
                        <Suspense fallback={null}><PtyTerminal
                          serverId={srv.id}
                          serverName={srv.name}
                          username={srv.username}
                          language={settings.language}
                          containerTarget={ptyTargets[pid] || null}
                          isVisible={visible}
                          onStatusChange={(st) =>
                            setPtyStatusMap((prev) =>
                              prev[pid] === st ? prev : { ...prev, [pid]: st }
                            )
                          }
                          onExitContainer={() =>
                            setPtyTargets((prev) => ({ ...prev, [pid]: null }))
                          }
                        /></Suspense>
                      </div>
                    );
                  })}
                  {termMode === 'quick' && (
                    <>
                  {/* Categorized Command Presets */}
                  <div className="mb-3 rounded-xl border border-white/10 bg-slate-950/55 p-2.5">
                    <div className="mb-2 flex flex-wrap gap-1.5 border-b border-white/5 pb-2">
                      {(
                        [
                          { id: 'system', label: t.catSystem, icon: <Cpu className="h-3.5 w-3.5" /> },
                          { id: 'storage', label: t.catStorage, icon: <HardDrive className="h-3.5 w-3.5" /> },
                          { id: 'network', label: t.catNetwork, icon: <Network className="h-3.5 w-3.5" /> },
                          { id: 'updates', label: t.catUpdates, icon: <Download className="h-3.5 w-3.5" /> },
                          { id: 'logs', label: t.catLogs, icon: <FileText className="h-3.5 w-3.5" /> },
                        ] as { id: TermCategory; label: string; icon: React.ReactNode }[]
                      ).map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() => setTermCat(cat.id)}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                            termCat === cat.id
                              ? 'bg-indigo-500/25 text-cyan-200 ring-1 ring-cyan-400/35'
                              : 'text-slate-400 hover:bg-white/5 hover:text-white'
                          }`}
                        >
                          {cat.icon}
                          {cat.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {TERMINAL_PRESETS[termCat].map((preset) => (
                        <button
                          key={preset.cmd}
                          disabled={cmdRunning}
                          title={describeTerminalCommand(preset.cmd, lang)}
                          onClick={() => handleRunCommand(preset.cmd)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-900/90 px-2.5 py-1 text-[11px] transition hover:border-cyan-400/40 hover:bg-cyan-500/10 disabled:opacity-50"
                        >
                          <span className="font-medium text-slate-200">{preset.label}</span>
                          <span className="font-mono text-[10px] text-cyan-300/80">{preset.cmd}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Live Output Console */}
                  <div className="h-80 space-y-3 overflow-y-auto rounded-2xl border border-white/10 bg-[#05080f] p-4 font-mono text-xs select-text">
                    {currentTerminal.length === 0 ? (
                      <p className="text-slate-500">$ {t.terminalPlaceholder}</p>
                    ) : (
                      currentTerminal.map((entry) => (
                        <div key={entry.id} className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="flex items-center gap-2 font-bold text-cyan-300">
                              <span>$ {entry.cmd}</span>
                              {entry.running && (
                                <RefreshCw className="h-3 w-3 animate-spin text-amber-400" />
                              )}
                            </span>
                            <span className="text-slate-500">
                              {entry.time} {DOT}{' '}
                              {entry.running ? t.runningCmd : `${entry.durationMs} ms`}
                            </span>
                          </div>
                          <pre
                            className={`whitespace-pre-wrap break-words leading-relaxed ${
                              entry.success ? 'text-emerald-300' : 'text-rose-300'
                            }`}
                          >
                            {entry.output || (entry.running ? '...' : '')}
                          </pre>
                        </div>
                      ))
                    )}
                    <div ref={termEndRef} />
                  </div>

                  {/* Manual Command Input */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleRunCommand();
                    }}
                    className="mt-3 flex gap-2"
                  >
                    <input
                      type="text"
                      spellCheck={false}
                      value={cmdInput}
                      onChange={(e) => setCmdInput(e.target.value)}
                      onKeyDown={(e) => {
                        const hist = cmdHistoryRef.current;
                        if (e.key === 'ArrowUp' && hist.length > 0) {
                          e.preventDefault();
                          const next = Math.min(cmdHistIdx + 1, hist.length - 1);
                          setCmdHistIdx(next);
                          setCmdInput(hist[next]);
                        } else if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          if (cmdHistIdx <= 0) {
                            setCmdHistIdx(-1);
                            setCmdInput('');
                          } else {
                            const next = cmdHistIdx - 1;
                            setCmdHistIdx(next);
                            setCmdInput(hist[next]);
                          }
                        }
                      }}
                      placeholder={t.terminalPlaceholder}
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/90 px-3.5 py-2.5 font-mono text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-400/50"
                    />
                    {cmdRunning ? (
                      <button
                        type="button"
                        onClick={handleStopCommand}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-rose-400/40 bg-rose-500/20 px-4 py-2.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/35"
                      >
                        <Square className="h-3.5 w-3.5 fill-rose-300" />
                        {t.stopCmd}
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={!cmdInput.trim()}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-4 py-2.5 text-xs font-semibold text-white shadow transition hover:brightness-110 disabled:opacity-50"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {t.runCommand}
                      </button>
                    )}
                  </form>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ADD / EDIT SERVER MODAL */}
      {serverModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSaveServer}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/15 bg-slate-900/95 p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">
                {serverForm.id ? t.editServerTitle : t.addServerTitle}
              </h2>
              <button
                type="button"
                onClick={() => setServerModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-slate-400">{t.displayName}</label>
                  <input
                    type="text"
                    spellCheck={false}
                    value={serverForm.name}
                    onChange={(e) =>
                      setServerForm(main.ServerConfig.createFrom({ ...serverForm, name: e.target.value }))
                    }
                    placeholder="EU-Prod-01"
                    className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-white outline-none focus:border-cyan-400/50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-slate-400">{t.group}</label>
                  <input
                    type="text"
                    spellCheck={false}
                    value={serverForm.group}
                    onChange={(e) =>
                      setServerForm(main.ServerConfig.createFrom({ ...serverForm, group: e.target.value }))
                    }
                    placeholder="Production"
                    className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-white outline-none focus:border-cyan-400/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="mb-1 block text-slate-400">{t.hostIp} *</label>
                  <input
                    type="text"
                    required
                    spellCheck={false}
                    value={serverForm.host}
                    onChange={(e) =>
                      setServerForm(main.ServerConfig.createFrom({ ...serverForm, host: e.target.value }))
                    }
                    placeholder="192.168.1.50"
                    className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 font-mono text-white outline-none focus:border-cyan-400/50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-slate-400">{t.port}</label>
                  <input
                    type="number"
                    value={serverForm.port}
                    onChange={(e) =>
                      setServerForm(
                        main.ServerConfig.createFrom({
                          ...serverForm,
                          port: parseInt(e.target.value, 10) || 22,
                        })
                      )
                    }
                    className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 font-mono text-white outline-none focus:border-cyan-400/50"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-slate-400">{t.username} *</label>
                <input
                  type="text"
                  required
                  spellCheck={false}
                  value={serverForm.username}
                  onChange={(e) =>
                    setServerForm(
                      main.ServerConfig.createFrom({ ...serverForm, username: e.target.value })
                    )
                  }
                  placeholder="root"
                  className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 font-mono text-white outline-none focus:border-cyan-400/50"
                />
              </div>

              <div>
                <label className="mb-1 block text-slate-400">{t.authMethod}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setServerForm(main.ServerConfig.createFrom({ ...serverForm, authType: 'password' }))
                    }
                    className={`rounded-xl border py-2 font-medium transition ${
                      serverForm.authType === 'password'
                        ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200'
                        : 'border-white/10 bg-slate-950/60 text-slate-400'
                    }`}
                  >
                    {t.password}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setServerForm(main.ServerConfig.createFrom({ ...serverForm, authType: 'key' }))
                    }
                    className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 font-medium transition ${
                      serverForm.authType === 'key'
                        ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200'
                        : 'border-white/10 bg-slate-950/60 text-slate-400'
                    }`}
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    {t.sshKey}
                  </button>
                </div>
              </div>

              {serverForm.authType === 'password' ? (
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-slate-400">{t.password}</label>
                    {serverForm.id && serverForm.hasPassword && (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                        <Shield className="h-3 w-3" /> {t.secretSavedKeep}
                      </span>
                    )}
                  </div>
                  <input
                    type="password"
                    value={serverForm.password}
                    placeholder={serverForm.id && serverForm.hasPassword ? MASK_SECRET : ''}
                    onChange={(e) =>
                      setServerForm(
                        main.ServerConfig.createFrom({ ...serverForm, password: e.target.value })
                      )
                    }
                    className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-white placeholder-slate-500 outline-none focus:border-cyan-400/50"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-slate-400">{t.keyPath}</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        spellCheck={false}
                        value={serverForm.keyPath}
                        onChange={(e) =>
                          setServerForm(
                            main.ServerConfig.createFrom({ ...serverForm, keyPath: e.target.value })
                          )
                        }
                        placeholder={t.keyPathPlaceholder}
                        className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 font-mono text-white placeholder-slate-500 outline-none focus:border-cyan-400/50"
                      />
                      <button
                        type="button"
                        onClick={handleBrowseKeyFile}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-cyan-400/30 bg-cyan-500/15 px-3 py-2 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/25"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                        {t.browseFile}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-slate-400">{t.privateKeyPaste}</label>
                      {serverForm.id && serverForm.hasPrivateKey && (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                          <Shield className="h-3 w-3" /> {t.secretSavedKeep}
                        </span>
                      )}
                    </div>
                    <textarea
                      rows={3}
                      spellCheck={false}
                      value={serverForm.privateKey}
                      onChange={(e) =>
                        setServerForm(
                          main.ServerConfig.createFrom({ ...serverForm, privateKey: e.target.value })
                        )
                      }
                      placeholder={
                        serverForm.id && serverForm.hasPrivateKey
                          ? `${MASK_SECRET} (${t.secretSavedKeep})`
                          : '-----BEGIN OPENSSH PRIVATE KEY-----'
                      }
                      className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 font-mono text-[11px] text-white placeholder-slate-500 outline-none focus:border-cyan-400/50"
                    />
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-slate-400">{t.passphraseOptional}</label>
                      {serverForm.id && serverForm.hasPassword && (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                          <Shield className="h-3 w-3" /> {t.secretSavedKeep}
                        </span>
                      )}
                    </div>
                    <input
                      type="password"
                      value={serverForm.password}
                      placeholder={serverForm.id && serverForm.hasPassword ? MASK_SECRET : ''}
                      onChange={(e) =>
                        setServerForm(
                          main.ServerConfig.createFrom({ ...serverForm, password: e.target.value })
                        )
                      }
                      className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-white placeholder-slate-500 outline-none focus:border-cyan-400/50"
                    />
                  </div>
                </>
              )}

              {/* Optional SOCKS5 Proxy */}
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                <label className="flex cursor-pointer items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-medium text-slate-200">{t.useSocks5}<HelpTip text={h.socks5} /></span>
                  <input
                    type="checkbox"
                    checked={!!serverForm.useProxy}
                    onChange={(e) =>
                      setServerForm(
                        main.ServerConfig.createFrom({
                          ...serverForm,
                          useProxy: e.target.checked,
                          proxyHost: serverForm.proxyHost || '127.0.0.1',
                          proxyPort: serverForm.proxyPort || 1080,
                        })
                      )
                    }
                    className="h-4 w-4 accent-cyan-400"
                  />
                </label>

                {serverForm.useProxy && (
                  <div className="mt-3 space-y-2.5 border-t border-white/10 pt-3">
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="col-span-2">
                        <label className="mb-1 block text-slate-400">{t.proxyHost}</label>
                        <input
                          type="text"
                          spellCheck={false}
                          value={serverForm.proxyHost || ''}
                          onChange={(e) =>
                            setServerForm(
                              main.ServerConfig.createFrom({ ...serverForm, proxyHost: e.target.value })
                            )
                          }
                          placeholder="127.0.0.1"
                          className="w-full rounded-xl border border-white/10 bg-slate-900/90 px-3 py-2 font-mono text-white outline-none focus:border-cyan-400/50"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-slate-400">{t.proxyPort}</label>
                        <input
                          type="number"
                          value={serverForm.proxyPort || 1080}
                          onChange={(e) =>
                            setServerForm(
                              main.ServerConfig.createFrom({
                                ...serverForm,
                                proxyPort: parseInt(e.target.value, 10) || 1080,
                              })
                            )
                          }
                          className="w-full rounded-xl border border-white/10 bg-slate-900/90 px-3 py-2 font-mono text-white outline-none focus:border-cyan-400/50"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="mb-1 block text-slate-400">{t.proxyUser}</label>
                        <input
                          type="text"
                          spellCheck={false}
                          value={serverForm.proxyUser || ''}
                          onChange={(e) =>
                            setServerForm(
                              main.ServerConfig.createFrom({ ...serverForm, proxyUser: e.target.value })
                            )
                          }
                          className="w-full rounded-xl border border-white/10 bg-slate-900/90 px-3 py-2 font-mono text-white outline-none focus:border-cyan-400/50"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-slate-400">{t.proxyPass}</label>
                        <input
                          type="password"
                          value={serverForm.proxyPass || ''}
                          placeholder={serverForm.id && serverForm.hasProxyPass ? MASK_SECRET : ''}
                          onChange={(e) =>
                            setServerForm(
                              main.ServerConfig.createFrom({ ...serverForm, proxyPass: e.target.value })
                            )
                          }
                          className="w-full rounded-xl border border-white/10 bg-slate-900/90 px-3 py-2 text-white placeholder-slate-500 outline-none focus:border-cyan-400/50"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Per-Server Custom Alert Rules (Collapsible) */}
              {(() => {
                const rules = serverForm.alertRules?.configured
                  ? serverForm.alertRules
                  : {
                      configured: true,
                      muted: false,
                      onOutage: true,
                      onFailedSvc: true,
                      cpuThreshold: 90,
                      ramThreshold: 90,
                      diskThreshold: 85,
                      cooldownMin: 10,
                    };
                const patchRules = (patch: Partial<typeof rules>) =>
                  setServerForm(
                    main.ServerConfig.createFrom({
                      ...serverForm,
                      alertRules: { ...rules, configured: true, ...patch },
                    })
                  );
                return (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <button
                      type="button"
                      onClick={() => setAlertRulesOpen((v) => !v)}
                      className="flex w-full items-center justify-between gap-2 text-start"
                    >
                      <div className="flex items-center gap-2">
                        {rules.muted ? (
                          <BellOff className="h-4 w-4 text-slate-400" />
                        ) : (
                          <Bell className="h-4 w-4 text-cyan-400" />
                        )}
                        <div>
                          <div className="flex items-center gap-2 text-xs font-semibold text-white">
                            <span>{ta.alertRules}</span>
                            {rules.muted && (
                              <span className="rounded-full bg-slate-700/80 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                                {ta.muted}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400">{ta.alertRulesSub}</p>
                        </div>
                      </div>
                      <ChevronDown
                        className={`h-4 w-4 text-slate-400 transition-transform ${alertRulesOpen ? 'rotate-180' : ''}`}
                      />
                    </button>

                    {alertRulesOpen && (
                      <div className="mt-3 space-y-3 border-t border-white/10 pt-3 text-xs">
                        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-slate-200">
                          <span>{ta.muteServer}</span>
                          <input
                            type="checkbox"
                            checked={!!rules.muted}
                            onChange={(e) => patchRules({ muted: e.target.checked })}
                            className="h-4 w-4 accent-rose-400"
                          />
                        </label>

                        <div className={`space-y-2.5 ${rules.muted ? 'pointer-events-none opacity-45' : ''}`}>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-slate-900/60 px-2.5 py-2 text-[11px] text-slate-300">
                              <span>{ta.alertOutage}</span>
                              <input
                                type="checkbox"
                                checked={!!rules.onOutage}
                                onChange={(e) => patchRules({ onOutage: e.target.checked })}
                                className="h-3.5 w-3.5 accent-cyan-400"
                              />
                            </label>
                            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-slate-900/60 px-2.5 py-2 text-[11px] text-slate-300">
                              <span>{ta.alertFailedSvc}</span>
                              <input
                                type="checkbox"
                                checked={!!rules.onFailedSvc}
                                onChange={(e) => patchRules({ onFailedSvc: e.target.checked })}
                                className="h-3.5 w-3.5 accent-cyan-400"
                              />
                            </label>
                          </div>

                          <div className="grid grid-cols-2 gap-2.5">
                            <div>
                              <label className="mb-1 block text-[11px] text-slate-400">{ta.cpuLimit}</label>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={rules.cpuThreshold}
                                onChange={(e) =>
                                  patchRules({ cpuThreshold: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) })
                                }
                                className="w-full rounded-xl border border-white/10 bg-slate-900/90 px-3 py-1.5 font-mono text-white outline-none focus:border-cyan-400/50"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-[11px] text-slate-400">{ta.ramLimit}</label>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={rules.ramThreshold}
                                onChange={(e) =>
                                  patchRules({ ramThreshold: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) })
                                }
                                className="w-full rounded-xl border border-white/10 bg-slate-900/90 px-3 py-1.5 font-mono text-white outline-none focus:border-cyan-400/50"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-[11px] text-slate-400">{ta.diskLimit}</label>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={rules.diskThreshold}
                                onChange={(e) =>
                                  patchRules({ diskThreshold: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) })
                                }
                                className="w-full rounded-xl border border-white/10 bg-slate-900/90 px-3 py-1.5 font-mono text-white outline-none focus:border-cyan-400/50"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-[11px] text-slate-400">{ta.cooldownMin}</label>
                              <input
                                type="number"
                                min={1}
                                max={1440}
                                value={rules.cooldownMin}
                                onChange={(e) =>
                                  patchRules({ cooldownMin: Math.max(1, Math.min(1440, parseInt(e.target.value, 10) || 10)) })
                                }
                                className="w-full rounded-xl border border-white/10 bg-slate-900/90 px-3 py-1.5 font-mono text-white outline-none focus:border-cyan-400/50"
                              />
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-500">{ta.zeroDisable}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {testResult && (
                <div
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
                    testResult.success
                      ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200'
                      : 'border-rose-400/30 bg-rose-500/15 text-rose-200'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0" />
                  )}
                  <span className="truncate">{testResult.message}</span>
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={testingConn}
                onClick={handleTestConnection}
                className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${testingConn ? 'animate-spin' : ''}`} />
                {testingConn ? t.testing : t.testConnection}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setServerModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-110"
                >
                  {t.saveServer}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* LOGS MODAL (SYSTEMD & DOCKER) */}
      {logsModal.open && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setLogsModal((prev) => ({ ...prev, open: false }));
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-4"
        >
          <div
            className={`flex flex-col rounded-3xl border border-white/15 bg-slate-950 p-4 shadow-2xl transition-all sm:p-5 ${
              logsExpanded ? 'h-[92vh] w-[96vw] max-w-none' : 'h-[82vh] w-full max-w-5xl'
            }`}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div className="flex min-w-0 items-center gap-2">
                <Terminal className="h-4 w-4 shrink-0 text-cyan-400" />
                <h2 className="truncate text-sm font-bold text-white">
                  {logsModal.kind === 'docker' ? t.containerLogs : t.serviceLogs}:{' '}
                  <span dir="ltr" className="inline-block font-mono text-cyan-300">
                    {logsModal.title}
                  </span>
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setLogsWrap((w) => !w)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition ${
                    logsWrap
                      ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200'
                      : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                  title={getLogsModalStrings(lang).wrap}
                >
                  <WrapText className="h-3.5 w-3.5" />
                  <span>{getLogsModalStrings(lang).wrap}</span>
                </button>
                <button
                  type="button"
                  disabled={logsModal.loading || !logsModal.content}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(logsModal.content || '');
                      setLogsCopied(true);
                      pushToast('success', getLogsModalStrings(lang).copiedToast);
                      setTimeout(() => setLogsCopied(false), 1800);
                    } catch {
                      pushToast('error', 'Clipboard unavailable');
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-200 transition hover:bg-emerald-500/25 disabled:opacity-40"
                >
                  {logsCopied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>
                    {logsCopied ? getLogsModalStrings(lang).copied : getLogsModalStrings(lang).copyAll}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setLogsExpanded((v) => !v)}
                  className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white"
                  title={logsExpanded ? getLogsModalStrings(lang).restore : getLogsModalStrings(lang).fullscreen}
                >
                  {logsExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenLogs(logsModal.kind, logsModal.target, logsModal.title)}
                  className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${logsModal.loading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setLogsModal((prev) => ({ ...prev, open: false }))}
                  className="rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <pre
              dir="ltr"
              className={`flex-1 overflow-auto rounded-2xl border border-white/10 bg-[#05080f] p-4 font-mono text-xs leading-relaxed text-emerald-300 select-text ${
                logsWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
              }`}
            >
              {logsModal.loading ? t.loadingLogs : logsModal.content}
            </pre>
          </div>
        </div>
      )}

      {/* CRYPTO SUPPORT MODAL */}
      {supportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl border border-white/15 bg-slate-900/95 p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400">
                  <Heart className="h-5 w-5 fill-rose-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">{t.supportTitle}</h2>
                  <p className="text-xs text-slate-400">{t.supportNote}</p>
                </div>
              </div>
              <button
                onClick={() => setSupportModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mb-4 text-xs leading-relaxed text-slate-300">{t.supportDesc}</p>

            <div className="mb-4 flex flex-wrap gap-1.5">
              {DONATION_WALLETS.map((w) => (
                <button
                  key={w.id}
                  onClick={() => {
                    setSelectedWalletId(w.id);
                    setCopiedAddr(false);
                  }}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                    selectedWallet.id === w.id
                      ? 'border-cyan-400/50 bg-cyan-500/20 text-white shadow'
                      : 'border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {w.symbol}
                </button>
              ))}
            </div>

            <div className="flex flex-col items-center gap-5 rounded-2xl border border-white/10 bg-slate-950/80 p-5 sm:flex-row">
              <div className="shrink-0 rounded-2xl bg-white p-3 shadow-lg">
                <QRCodeSVG
                  value={selectedWallet.address}
                  size={148}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#090d16"
                />
              </div>

              <div className="min-w-0 flex-1 text-center sm:text-start">
                <span
                  className={`inline-block rounded-lg bg-gradient-to-r px-2.5 py-0.5 text-[11px] font-bold text-slate-950 ${selectedWallet.accent}`}
                >
                  {selectedWallet.symbol}
                </span>
                <h3 className="mt-2 text-sm font-bold text-white">{selectedWallet.name}</h3>
                <p className="mt-0.5 text-[11px] text-slate-400">{selectedWallet.networks}</p>

                <div className="mt-3 break-all rounded-xl border border-white/10 bg-slate-900/90 p-2.5 font-mono text-[11px] text-cyan-200 select-text">
                  {selectedWallet.address}
                </div>

                <button
                  onClick={() => handleCopyWallet(selectedWallet.address)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
                >
                  {copiedAddr ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      {t.copied}
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      {t.copyAddress}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM CONFIRM MODAL */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-white/15 bg-slate-900/95 p-6 shadow-2xl">
            <div className="flex items-start gap-3.5">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                  confirmModal.tone === 'danger'
                    ? 'bg-rose-500/20 text-rose-400'
                    : 'bg-amber-500/20 text-amber-400'
                }`}
              >
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-white">{confirmModal.title}</h2>
                <p className="mt-1.5 text-xs font-medium text-slate-200">{confirmModal.message}</p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
                  {confirmModal.warning}
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className={`rounded-xl px-5 py-2 text-xs font-semibold text-white shadow-lg transition hover:brightness-110 ${
                  confirmModal.tone === 'danger'
                    ? 'bg-gradient-to-r from-rose-500 to-red-600 shadow-rose-500/25'
                    : 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-amber-500/25'
                }`}
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BROADCAST & SNIPPETS MODAL */}
      <Suspense fallback={null}><BroadcastSnippetsModal
        open={broadcastOpen}
        servers={activeServers}
        language={settings.language}
        privacyMode={!!settings.privacyMode}
        onClose={() => setBroadcastOpen(false)}
        onToast={(type, message) => pushToast(type, message)}
      /></Suspense>

      {/* GLOBAL SETTINGS MODAL */}
      {settingsModalOpen && (<Suspense fallback={null}><SettingsModal
        open={settingsModalOpen}
        initialTab={settingsTab}
        settings={settings}
        appVersion="v0.4.1"
        simpleLabel={t.simpleMode}
        proLabel={t.proMode}
        onClose={() => setSettingsModalOpen(false)}
        onUpdateSettings={(patch) => updateSettings(patch)}
        onServersImported={async () => {
          try {
            const updated = await GetServers();
            setServers(updated || []);
            if (updated && updated.length > 0) {
              setDemoMode(false);
              setSelectedId((prev) =>
                updated.some((s) => s.id === prev) ? prev : updated[0].id
              );
            }
          } catch (err) {
            console.error(err);
          }
        }}
        onOpenSupport={() => setSupportModalOpen(true)}
        onToast={(type, message) => pushToast(type, message)}
      /></Suspense>)}

      {/* TOASTS */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 space-y-2">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-medium shadow-2xl backdrop-blur-xl ${
              item.type === 'success'
                ? 'border-emerald-400/30 bg-emerald-950/90 text-emerald-200'
                : item.type === 'error'
                  ? 'border-rose-400/30 bg-rose-950/90 text-rose-200'
                  : 'border-white/15 bg-slate-900/95 text-slate-200'
            }`}
          >
            {item.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : item.type === 'error' ? (
              <XCircle className="h-4 w-4 text-rose-400" />
            ) : (
              <Activity className="h-4 w-4 text-cyan-400" />
            )}
            <span>{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
