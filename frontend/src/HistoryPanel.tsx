import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Cpu,
  HardDrive,
  Info,
  MemoryStick,
  Network,
  Power,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Skull,
  Sparkles,
  Terminal,
  Wrench,
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
import { CheckSysstatPreflight, EnableSysstat, GetServerHistory, SaveHistoryReport } from '../wailsjs/go/main/App';
import { main } from '../wailsjs/go/models';
import { sanitizeErrorText } from './errorExplain';
import { getHistoryStrings, type HistoryStrings } from './historyI18n';

interface HistoryPanelProps {
  serverId: string;
  serverName: string;
  isDemo: boolean;
  language: string;
  privacyMode: boolean;
  reportFormat?: string;
  onToast: (type: 'success' | 'error', message: string) => void;
}

type RangeKey = '24h' | '7d' | '30d';
type ChartKind = 'cpu' | 'memory' | 'load' | 'network';
type IncidentFilter = 'all' | 'reboot' | 'oom' | 'service' | 'ssh_auth';

function formatNetRate(kbps: number): string {
  if (!kbps || kbps <= 0) return '0 KB/s';
  if (kbps >= 1024) return (kbps / 1024).toFixed(2) + " MB/s";
  return Math.round(kbps) + " KB/s";
}

function resolveInsightCopy(ins: main.HistoryInsight, th: HistoryStrings): { title: string; desc: string } {
  switch (ins.code) {
    case 'high_steal':
      return { title: th.insightStealTitle, desc: th.insightStealDesc };
    case 'high_iowait':
      return { title: th.insightIOWaitTitle, desc: th.insightIOWaitDesc };
    case 'high_cpu':
      return { title: th.insightCpuTitle, desc: th.insightCpuDesc };
    case 'high_ram':
      return { title: th.insightRamTitle, desc: th.insightRamDesc };
    case 'oom_events':
      return { title: th.insightOomTitle, desc: th.insightOomDesc };
    case 'ssh_bruteforce':
      return { title: th.insightSshTitle, desc: th.insightSshDesc };
    case 'service_crashes':
      return { title: th.insightSvcTitle, desc: th.insightSvcDesc };
    case 'swap_pressure':
      return { title: th.insightSwapTitle, desc: th.insightSwapDesc };
    case 'high_load':
      return { title: th.insightLoadTitle, desc: th.insightLoadDesc };
    case 'net_burst':
      return { title: th.insightNetTitle, desc: th.insightNetDesc };
    case 'reboots':
      return { title: th.insightRebootTitle, desc: th.insightRebootDesc };
    default:
      return { title: th.insightHealthyTitle, desc: th.insightHealthyDesc };
  }
}

function resolveIncidentExplain(cat: string, th: HistoryStrings): { label: string; explain: string } {
  switch (cat) {
    case 'oom':
      return { label: th.catOom, explain: th.explainOom };
    case 'reboot':
      return { label: th.catReboot, explain: th.explainReboot };
    case 'ssh_auth':
      return { label: th.catSsh, explain: th.explainSsh };
    default:
      return { label: th.catService, explain: th.explainService };
  }
}

export default function HistoryPanel({
  serverId,
  serverName,
  language,
  privacyMode,
  reportFormat = 'md',
  onToast,
}: HistoryPanelProps) {
  const th = getHistoryStrings(language);
  const onToastRef = useRef(onToast);
  onToastRef.current = onToast;
  const [range, setRange] = useState<RangeKey>('24h');
  const [chartKind, setChartKind] = useState<ChartKind>('cpu');
  const [incFilter, setIncFilter] = useState<IncidentFilter>('all');
  const [report, setReport] = useState<main.ServerHistoryReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savingReport, setSavingReport] = useState(false);
  const [preflight, setPreflight] = useState<main.SysstatPreflightResult | null>(null);
  const [checkingPreflight, setCheckingPreflight] = useState(false);

  // Monotonic request id: a slower earlier request (e.g. 24h on a cold SSH
  // connection) can resolve after a faster later one (30d on the warm
  // connection); only the newest response may touch the state.
  const loadSeqRef = useRef(0);

  const loadHistory = useCallback(
    async (targetRange: RangeKey) => {
      const seq = ++loadSeqRef.current;
      setLoading(true);
      try {
        const data = await GetServerHistory(serverId, targetRange);
        if (seq !== loadSeqRef.current) return;
        setReport(data);
      } catch (err) {
        if (seq !== loadSeqRef.current) return;
        onToastRef.current('error', String(err));
      } finally {
        if (seq === loadSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [serverId]
  );

  useEffect(() => {
    loadHistory(range);
  }, [serverId, range, loadHistory]);

  const handleRunPreflight = async () => {
    if (checkingPreflight) return;
    setCheckingPreflight(true);
    try {
      const res = await CheckSysstatPreflight(serverId);
      setPreflight(res);
    } catch (err) {
      onToast('error', String(err));
    } finally {
      setCheckingPreflight(false);
    }
  };

  const handleEnableSysstat = async () => {
    if (enabling) return;
    setEnabling(true);
    try {
      const res = await EnableSysstat(serverId);
      if (res?.success) {
        onToast('success', res.message || 'sysstat enabled');
        await loadHistory(range);
      } else {
        onToast('error', res?.message || 'Failed to enable sysstat');
      }
    } catch (err) {
      onToast('error', String(err));
    } finally {
      setEnabling(false);
    }
  };

  const filteredIncidents = useMemo(() => {
    const list = report?.incidents || [];
    if (incFilter === 'all') return list;
    return list.filter((i) => i.category === incFilter);
  }, [report?.incidents, incFilter]);

  const buildRichReportText = useCallback((): string => {
    if (!report) return '';
    const s = report.summary;
    const score = s?.stabilityScore ?? 100;
    const gradeEmoji = score >= 85 ? '🟢' : score >= 65 ? '🟡' : '🔴';
    const isMd = reportFormat !== 'txt';
    const h1 = (x: string) => (isMd ? `# ${x}` : `========================================\n${x}\n========================================`);
    const h2 = (x: string) => (isMd ? `## ${x}` : `\n--- ${x} ---`);
    const h3 = (x: string) => (isMd ? `### ${x}` : `[ ${x} ]`);

    const lines: string[] = [
      h1(`🖥️ ZentraDeck — ${th.title}`),
      `📌 **${serverName}** | ⏱️ ${range} | 🕒 ${report.generatedAt}`,
      `🛡️ sysstat: ${report.sysstatActive ? '✅ ' + th.sysstatActiveBadge : 'ℹ️ ' + th.sysstatOptionalBadge}`,
      '',
      h2(`⚡ ${th.reportExecTitle}`),
      `${gradeEmoji} **${th.stabilityScoreLabel}:** ${score}/100`,
    ];

    if (report.sysstatActive && s && s.sampleCount > 0) {
      lines.push(
        `🔥 **${th.peakCpu}:** ${s.peakCpu.value}% (${th.avgLabel}: ${s.avgCpu}%) — ${s.peakCpu.timestamp}`,
        `🧠 **${th.peakRam}:** ${s.peakRam.value}% (${th.avgLabel}: ${s.avgRam}%) — ${s.peakRam.timestamp}`,
        `💾 **${th.peakIOWaitSteal}:** IO ${s.peakIOWait.value}% | Steal ${s.peakSteal.value}%`,
        `🌐 **${th.peakNetLoad}:** Load ${s.peakLoad.value} | ↓${formatNetRate(s.peakNetRx.value)} ↑${formatNetRate(s.peakNetTx.value)}`
      );
    }
    lines.push(`🚨 **${th.incidentsTitle}:** ${(report.incidents || []).length}`, '');

    // Part 2: Full Forensic Report
    lines.push(h2(`🔬 ${th.reportFullTitle}`), '');

    if (report.sysstatActive && s && s.sampleCount > 0) {
      lines.push(h3(`📊 ${th.chartsTitle} (${s.sampleCount} samples · ${s.dataSpan})`));
      if (isMd) {
        lines.push(
          `| ${th.tblMetric} | ${th.tblPeak} | ${th.tblAvg} | ${th.tblPeakTime} |`,
          `| :--- | :---: | :---: | :--- |`,
          `| 🔥 ${th.rowCpuTotal} | ${s.peakCpu.value}% | ${s.avgCpu}% | ${s.peakCpu.timestamp} |`,
          `| 🧠 ${th.ramUsed} | ${s.peakRam.value}% | ${s.avgRam}% | ${s.peakRam.timestamp} |`,
          `| 💿 ${th.swapUsed} | ${s.peakSwap?.value ?? 0}% | - | ${s.peakSwap?.timestamp || '-'} |`,
          `| ⏳ ${th.cpuIOWait} | ${s.peakIOWait.value}% | ${s.avgIOWait ?? 0}% | ${s.peakIOWait.timestamp} |`,
          `| ☁️ ${th.cpuSteal} | ${s.peakSteal.value}% | ${s.avgSteal ?? 0}% | ${s.peakSteal.timestamp} |`,
          `| ⚙️ ${th.load1m} | ${s.peakLoad.value} | ${s.avgLoad ?? 0} | ${s.peakLoad.timestamp} |`,
          `| ⬇️ ${th.netRx} | ${formatNetRate(s.peakNetRx.value)} | - | ${s.peakNetRx.timestamp} |`,
          `| ⬆️ ${th.netTx} | ${formatNetRate(s.peakNetTx.value)} | - | ${s.peakNetTx.timestamp} |`,
          ''
        );
      } else {
        lines.push(
          `• ${th.rowCpuTotal}: ${th.tblPeak} ${s.peakCpu.value}% | ${th.avgLabel} ${s.avgCpu}% (${s.peakCpu.timestamp})`,
          `• ${th.ramUsed}: ${th.tblPeak} ${s.peakRam.value}% | ${th.avgLabel} ${s.avgRam}% (${s.peakRam.timestamp})`,
          `• ${th.swapUsed}: ${th.tblPeak} ${s.peakSwap?.value ?? 0}% (${s.peakSwap?.timestamp || '-'})`,
          `• ${th.cpuIOWait}: ${th.tblPeak} ${s.peakIOWait.value}% | ${th.avgLabel} ${s.avgIOWait ?? 0}% (${s.peakIOWait.timestamp})`,
          `• ${th.cpuSteal}: ${th.tblPeak} ${s.peakSteal.value}% | ${th.avgLabel} ${s.avgSteal ?? 0}% (${s.peakSteal.timestamp})`,
          `• ${th.load1m}: ${th.tblPeak} ${s.peakLoad.value} | ${th.avgLabel} ${s.avgLoad ?? 0} (${s.peakLoad.timestamp})`,
          `• ${th.netRx} / ${th.netTx}: ↓${formatNetRate(s.peakNetRx.value)} / ↑${formatNetRate(s.peakNetTx.value)}`,
          ''
        );
      }
    }

    lines.push(h3(`🤖 ${th.insightsTitle}`));
    for (const ins of report.insights || []) {
      const c = resolveInsightCopy(ins, th);
      const emo = ins.severity === 'critical' ? '🔴' : ins.severity === 'warning' ? '🟠' : ins.severity === 'good' ? '🟢' : '🔵';
      lines.push(`- ${emo} **${c.title}** (${ins.metric}): ${c.desc}`);
    }
    lines.push('');

    lines.push(h3(`📜 ${th.incidentsTitle} (${(report.incidents || []).length})`));
    if (!report.incidents || report.incidents.length === 0) {
      lines.push(`✅ ${th.noIncidents}`);
    } else {
      for (const inc of report.incidents) {
        const meta = resolveIncidentExplain(inc.category, th);
        const emo = inc.category === 'oom' ? '💀' : inc.category === 'reboot' ? '🔄' : inc.category === 'ssh_auth' ? '🔐' : '⚠️';
        lines.push(`- ${emo} **[${inc.timestamp}] ${meta.label} (${inc.service}):** ${sanitizeErrorText(inc.summary, privacyMode)}`);
        lines.push(`  - 💡 ${meta.explain}`);
        if (inc.rawLog) {
          lines.push(`  - 🧾 \`${sanitizeErrorText(inc.rawLog, privacyMode)}\``);
        }
      }
    }
    lines.push('', '---', isMd ? '✨ Generated locally by **[ZentraDeck](https://github.com/CyberRhythm/ZentraDeck)** (Zero Telemetry · Open Source)' : '✨ Generated locally by ZentraDeck (Zero Telemetry) — https://github.com/CyberRhythm/ZentraDeck');
    return lines.join('\n');
  }, [report, reportFormat, serverName, range, th, privacyMode]);

  const handleCopyReport = async () => {
    const text = buildRichReportText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onToast('success', th.reportCopied);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onToast('error', 'Clipboard unavailable');
    }
  };

  const handleSaveReport = async () => {
    if (savingReport || !report) return;
    const text = buildRichReportText();
    if (!text) return;
    setSavingReport(true);
    try {
      const res = await SaveHistoryReport(serverName, range, reportFormat, text);
      if (res?.success) {
        onToast('success', `${th.reportSavedToast}: ${res.message}`);
      } else {
        onToast('error', res?.message || 'Save failed');
      }
    } catch (err) {
      onToast('error', String(err));
    } finally {
      setSavingReport(false);
    }
  };

  const points = report?.points || [];
  const summary = report?.summary;
  const sysstatActive = !!report?.sysstatActive;
  const insights = report?.insights || [];

  return (
    <div className="space-y-5">
      {/* Top Control Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/65 p-4 backdrop-blur-xl">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-white">{th.title}</h2>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
                sysstatActive
                  ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300'
                  : 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200'
              }`}
            >
              {sysstatActive ? <ShieldCheck className="h-3 w-3" /> : <Info className="h-3 w-3" />}
              {sysstatActive ? th.sysstatActiveBadge : th.sysstatOptionalBadge}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">{th.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Range Selector */}
          <div className="flex rounded-xl border border-white/10 bg-slate-950/80 p-0.5 text-xs">
            {([
              { id: '24h', label: th.range24h },
              { id: '7d', label: th.range7d },
              { id: '30d', label: th.range30d },
            ] as { id: RangeKey; label: string }[]).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={`rounded-lg px-3 py-1 font-medium transition ${
                  range === r.id
                    ? 'bg-cyan-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => loadHistory(range)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {th.refresh}
          </button>

          <button
            type="button"
            disabled={!report || loading}
            onClick={handleCopyReport}
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-400/30 bg-indigo-500/15 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/25 disabled:opacity-40"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
            {th.copyReport}
          </button>

          <button
            type="button"
            disabled={!report || loading || savingReport}
            onClick={handleSaveReport}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            {th.saveReportBtn} (.{reportFormat})
          </button>
        </div>
      </div>

      {/* Loading Indicator */}
      {loading && !report && (
        <div className="flex items-center justify-center gap-2.5 rounded-2xl border border-white/10 bg-slate-900/50 p-10 text-xs text-slate-300">
          <RefreshCw className="h-4 w-4 animate-spin text-cyan-400" />
          <span>{th.loading}</span>
        </div>
      )}

      {/* Optional sysstat Transparent Activation Card */}
      {report && !sysstatActive && (
        <div className="space-y-3 rounded-2xl border border-cyan-400/25 bg-gradient-to-br from-cyan-500/[0.08] to-indigo-500/[0.06] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-300" />
              <h3 className="text-sm font-bold text-white">{th.optionalTitle}</h3>
            </div>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
              {th.optionalBadge}
            </span>
          </div>

          <p className="text-xs leading-relaxed text-slate-200">{th.optionalBody}</p>
          <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.08] px-3 py-2 text-[11px] font-medium leading-relaxed text-amber-100">
            🛡️ {th.osNativeNotice}
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {[th.optionalPoint1, th.optionalPoint2, th.optionalPoint3].map((pt, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-xl border border-white/10 bg-slate-950/50 p-3 text-[11px] leading-relaxed text-slate-300"
              >
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                <span>{pt}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              disabled={checkingPreflight}
              onClick={handleRunPreflight}
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-3.5 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/25 disabled:opacity-50"
            >
              <ShieldCheck className={`h-3.5 w-3.5 ${checkingPreflight ? 'animate-pulse' : ''}`} />
              {checkingPreflight ? th.preflightChecking : th.preflightBtn}
            </button>

            <button
              type="button"
              disabled={enabling}
              onClick={handleEnableSysstat}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:brightness-110 disabled:opacity-50"
            >
              <Wrench className={`h-3.5 w-3.5 ${enabling ? 'animate-spin' : ''}`} />
              {enabling ? th.enablingSysstat : th.enableSysstatBtn}
            </button>

            <details className="text-[11px] text-slate-400">
              <summary className="cursor-pointer select-none hover:text-slate-200">
                {th.manualCmdLabel}
              </summary>
              <pre
                dir="ltr"
                className="mt-2 overflow-x-auto rounded-lg border border-white/10 bg-slate-950/85 px-3 py-2 font-mono text-[11px] text-cyan-200"
              >
                sudo apt update &amp;&amp; sudo apt install -y sysstat &amp;&amp; sudo systemctl enable --now sysstat
              </pre>
            </details>
          </div>

          {preflight && (
            <div className={`rounded-xl border p-3 text-[11px] space-y-1.5 ${preflight.safe ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100' : 'border-amber-400/35 bg-amber-500/10 text-amber-100'}`}>
              <div className="font-bold">
                {preflight.safe ? '✅ ' + th.preflightSafe : '⚠️ ' + th.preflightWarn}
              </div>
              <div dir="ltr" className="flex flex-wrap gap-2 font-mono text-[10px] opacity-90">
                <span>OS: {preflight.distro}</span>
                <span>· Pkg: {preflight.pkgManager}</span>
                <span>· /var/log free: {preflight.freeLogMB} MB</span>
                <span>· systemd: {preflight.hasSystemd ? 'yes' : 'no'}</span>
                {preflight.otherCollectors && preflight.otherCollectors.length > 0 && (
                  <span>· Other tools: {preflight.otherCollectors.join(', ')}</span>
                )}
              </div>
              {preflight.exactCommand && (
                <pre dir="ltr" className="overflow-x-auto rounded-lg bg-slate-950/70 px-2.5 py-1.5 font-mono text-[10px] text-cyan-200">
                  {preflight.exactCommand}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      {/* Peak Summary Cards (when sysstat has samples) */}
      {report && sysstatActive && summary && points.length > 0 && (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{th.peakCpu}</span>
              <Cpu className="h-4 w-4 text-cyan-400" />
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-cyan-300">{summary.peakCpu.value}%</span>
              <span className="text-[11px] text-slate-400">
                {th.avgLabel}: {summary.avgCpu}%
              </span>
            </div>
            <div dir="ltr" className="mt-1 truncate font-mono text-[10px] text-slate-500">
              {summary.peakCpu.timestamp}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{th.peakRam}</span>
              <MemoryStick className="h-4 w-4 text-indigo-400" />
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-indigo-300">{summary.peakRam.value}%</span>
              <span className="text-[11px] text-slate-400">
                {th.avgLabel}: {summary.avgRam}%
              </span>
            </div>
            <div dir="ltr" className="mt-1 truncate font-mono text-[10px] text-slate-500">
              {summary.peakRam.timestamp}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{th.peakIOWaitSteal}</span>
              <HardDrive className="h-4 w-4 text-amber-400" />
            </div>
            <div className="mt-1.5 flex items-baseline gap-3">
              <span className="text-xl font-extrabold text-amber-300">
                IO {summary.peakIOWait.value}%
              </span>
              <span
                className={`text-sm font-bold ${
                  summary.peakSteal.value >= 5 ? 'text-rose-400' : 'text-emerald-300'
                }`}
              >
                Steal {summary.peakSteal.value}%
              </span>
            </div>
            <div dir="ltr" className="mt-1 truncate font-mono text-[10px] text-slate-500">
              {summary.peakSteal.value >= 5 ? summary.peakSteal.timestamp : summary.peakIOWait.timestamp}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{th.peakNetLoad}</span>
              <Network className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-1.5 flex items-baseline gap-2.5">
              <span className="text-xl font-extrabold text-emerald-300">
                L {summary.peakLoad.value}
              </span>
              <span dir="ltr" className="font-mono text-[11px] text-slate-300">
                ↓{formatNetRate(summary.peakNetRx.value)} ↑{formatNetRate(summary.peakNetTx.value)}
              </span>
            </div>
            <div dir="ltr" className="mt-1 truncate font-mono text-[10px] text-slate-500">
              {summary.peakLoad.timestamp}
            </div>
          </div>
        </div>
      )}

      {/* Diagnostic Insights Section */}
      {report && insights.length > 0 && (
        <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/65 p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-200">
                <Activity className="h-4 w-4 text-cyan-400" />
                {th.insightsTitle}
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-400">{th.insightsSub}</p>
            </div>
            {summary && (
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-1.5 text-xs">
                <span className="text-slate-400">{th.stabilityScoreLabel}:</span>
                <span className={`font-mono text-sm font-extrabold ${(summary.stabilityScore ?? 100) >= 85 ? 'text-emerald-300' : (summary.stabilityScore ?? 100) >= 65 ? 'text-amber-300' : 'text-rose-300'}`}>
                  {summary.stabilityScore ?? 100}/100
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {insights.map((ins, idx) => {
              const copy = resolveInsightCopy(ins, th);
              const tone =
                ins.severity === 'critical'
                  ? 'border-rose-400/30 bg-rose-500/10 text-rose-200'
                  : ins.severity === 'warning'
                    ? 'border-amber-400/30 bg-amber-500/10 text-amber-200'
                    : ins.severity === 'good'
                      ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                      : 'border-cyan-400/25 bg-cyan-500/10 text-cyan-200';
              return (
                <div key={`${ins.code}-${idx}`} className={`rounded-xl border p-3 text-xs ${tone}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">{copy.title}</span>
                    {ins.metric && (
                      <span dir="ltr" className="rounded-md bg-slate-950/60 px-2 py-0.5 font-mono text-[11px] font-bold">
                        {ins.metric}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed opacity-90">{copy.desc}</p>
                  {ins.detail && (
                    <div dir="ltr" className="mt-1 font-mono text-[10px] opacity-70">
                      {ins.detail}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Multi-Metric Interactive Charts (sysstat) */}
      {report && sysstatActive && (
        <div className="space-y-3.5 rounded-2xl border border-white/10 bg-slate-900/65 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-200">{th.chartsTitle}</h3>
              {report.intervalHint && (
                <p dir="ltr" className="mt-0.5 font-mono text-[10px] text-slate-400">
                  {report.intervalHint} · {points.length} samples
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-slate-950/70 p-0.5 text-[11px]">
              {([
                { id: 'cpu', label: th.chartCpu },
                { id: 'memory', label: th.chartMemory },
                { id: 'load', label: th.chartLoad },
                { id: 'network', label: th.chartNetwork },
              ] as { id: ChartKind; label: string }[]).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setChartKind(c.id)}
                  className={`rounded-lg px-2.5 py-1 font-medium transition ${
                    chartKind === c.id
                      ? 'bg-indigo-500 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {points.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/40 p-6 text-center text-xs text-slate-400">
              {th.noSysstatSamplesYet}
            </div>
          ) : (
            <>
              <div dir="ltr" className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {chartKind === 'cpu' ? (
                    <AreaChart data={points} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="timestamp" stroke="#64748b" fontSize={10} minTickGap={24} />
                      <YAxis domain={[0, 100]} stroke="#64748b" fontSize={10} unit="%" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: 'rgba(255,255,255,0.14)',
                          borderRadius: '12px',
                          fontSize: '11px',
                        }}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.fullTime || ''}
                      />
                      <Area type="monotone" dataKey="cpuUser" stackId="1" name={th.cpuUser} stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.35} />
                      <Area type="monotone" dataKey="cpuSystem" stackId="1" name={th.cpuSystem} stroke="#818cf8" fill="#818cf8" fillOpacity={0.35} />
                      <Area type="monotone" dataKey="cpuIOWait" stackId="1" name={th.cpuIOWait} stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.45} />
                      <Area type="monotone" dataKey="cpuSteal" stackId="1" name={th.cpuSteal} stroke="#fb7185" fill="#fb7185" fillOpacity={0.55} />
                    </AreaChart>
                  ) : chartKind === 'memory' ? (
                    <AreaChart data={points} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="timestamp" stroke="#64748b" fontSize={10} minTickGap={24} />
                      <YAxis domain={[0, 100]} stroke="#64748b" fontSize={10} unit="%" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: 'rgba(255,255,255,0.14)',
                          borderRadius: '12px',
                          fontSize: '11px',
                        }}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.fullTime || ''}
                      />
                      <Area type="monotone" dataKey="ramPercent" name={th.ramUsed} stroke="#818cf8" fill="#818cf8" fillOpacity={0.3} />
                      <Area type="monotone" dataKey="swapPercent" name={th.swapUsed} stroke="#f472b6" fill="#f472b6" fillOpacity={0.22} />
                    </AreaChart>
                  ) : chartKind === 'load' ? (
                    <AreaChart data={points} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="timestamp" stroke="#64748b" fontSize={10} minTickGap={24} />
                      <YAxis stroke="#64748b" fontSize={10} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: 'rgba(255,255,255,0.14)',
                          borderRadius: '12px',
                          fontSize: '11px',
                        }}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.fullTime || ''}
                      />
                      <Area type="monotone" dataKey="load1" name={th.load1m} stroke="#34d399" fill="#34d399" fillOpacity={0.28} />
                      <Area type="monotone" dataKey="load5" name={th.load5m} stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.16} />
                    </AreaChart>
                  ) : (
                    <AreaChart data={points} margin={{ top: 8, right: 12, left: -4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="timestamp" stroke="#64748b" fontSize={10} minTickGap={24} />
                      <YAxis stroke="#64748b" fontSize={10} tickFormatter={(v: number) => (v >= 1024 ? (v / 1024).toFixed(1) + " MB/s" : v + " KB/s")} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: 'rgba(255,255,255,0.14)',
                          borderRadius: '12px',
                          fontSize: '11px',
                        }}
                        formatter={(val: unknown) => formatNetRate(Number(val) || 0)}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.fullTime || ''}
                      />
                      <Area type="monotone" dataKey="netRxKBps" name={th.netRx} stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.25} />
                      <Area type="monotone" dataKey="netTxKBps" name={th.netTx} stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.22} />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              </div>

              {chartKind === 'cpu' && (
                <p className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-[11px] leading-relaxed text-slate-400">
                  {th.proCpuNote}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Layer 1: Incident Timeline (Always Active via journald) */}
      {report && (
        <div className="space-y-3.5 rounded-2xl border border-white/10 bg-slate-900/65 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-200">
                <Clock className="h-4 w-4 text-amber-400" />
                {th.incidentsTitle}
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-400">{th.incidentsSub}</p>
            </div>

            <div className="flex flex-wrap gap-1 text-[11px]">
              {([
                { id: 'all', label: th.filterAll },
                { id: 'oom', label: th.filterOom },
                { id: 'reboot', label: th.filterReboot },
                { id: 'service', label: th.filterService },
                { id: 'ssh_auth', label: th.filterSsh },
              ] as { id: IncidentFilter; label: string }[]).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setIncFilter(f.id)}
                  className={`rounded-lg border px-2.5 py-1 font-medium transition ${
                    incFilter === f.id
                      ? 'border-cyan-400/40 bg-cyan-500/20 text-cyan-200'
                      : 'border-white/10 bg-slate-950/50 text-slate-400 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {filteredIncidents.length === 0 ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.06] p-6 text-xs text-emerald-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>{th.noIncidents}</span>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredIncidents.map((inc) => {
                const meta = resolveIncidentExplain(inc.category, th);
                const icon =
                  inc.category === 'oom' ? (
                    <Skull className="h-4 w-4 text-rose-400" />
                  ) : inc.category === 'reboot' ? (
                    <Power className="h-4 w-4 text-amber-400" />
                  ) : inc.category === 'ssh_auth' ? (
                    <ShieldAlert className="h-4 w-4 text-cyan-400" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                  );
                const badgeTone =
                  inc.severity === 'critical'
                    ? 'border-rose-400/35 bg-rose-500/15 text-rose-200'
                    : inc.severity === 'warning'
                      ? 'border-amber-400/35 bg-amber-500/15 text-amber-200'
                      : 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200';
                return (
                  <div
                    key={inc.id}
                    className="rounded-xl border border-white/10 bg-slate-950/55 p-3.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {icon}
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeTone}`}>
                          {meta.label}
                        </span>
                        <span dir="ltr" className="font-mono text-[11px] font-semibold text-slate-200">
                          {inc.service}
                        </span>
                      </div>
                      <span dir="ltr" className="font-mono text-[11px] text-slate-400">
                        {inc.timestamp}
                      </span>
                    </div>

                    <p className="mt-2 font-semibold text-white">
                      {sanitizeErrorText(inc.summary, privacyMode)}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{meta.explain}</p>

                    {inc.rawLog && (
                      <details className="mt-2 rounded-lg border border-white/10 bg-slate-900/70 px-3 py-1.5">
                        <summary className="flex cursor-pointer select-none items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-200">
                          <Terminal className="h-3 w-3" />
                          {th.rawLogLabel}
                        </summary>
                        <pre
                          dir="ltr"
                          className="mt-1.5 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[10px] text-slate-300"
                        >
                          {sanitizeErrorText(inc.rawLog, privacyMode)}
                        </pre>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}