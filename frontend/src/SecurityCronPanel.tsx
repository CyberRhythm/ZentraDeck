import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  Info,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  DeleteCronJob,
  GetScheduledTasks,
  GetSecurityAudit,
  SaveCronJob,
  ToggleCronJob,
} from '../wailsjs/go/main/App';
import { main } from '../wailsjs/go/models';
import {
  describeCronSchedule,
  describeSystemdTimer,
  getSecurityCronStrings,
  getWeekDays,
  type SecurityCronStrings,
} from './securityCronI18n';

interface SecurityCronPanelProps {
  serverId: string;
  language: string;
  onToast: (type: 'success' | 'error', message: string) => void;
}

type BuilderMode = 'minutes' | 'hours' | 'daily' | 'weekly' | 'reboot';

function checkMeta(id: string, ts: SecurityCronStrings): { title: string; why: string } {
  switch (id) {
    case 'ssh_root':
      return { title: ts.chkSshRoot, why: ts.chkSshRootWhy };
    case 'ssh_pass':
      return { title: ts.chkSshPass, why: ts.chkSshPassWhy };
    case 'fail2ban':
      return { title: ts.chkFail2ban, why: ts.chkFail2banWhy };
    case 'firewall':
      return { title: ts.chkFirewall, why: ts.chkFirewallWhy };
    case 'updates':
      return { title: ts.chkUpdates, why: ts.chkUpdatesWhy };
    case 'ssl_expiry':
      return { title: ts.chkSsl, why: ts.chkSslWhy };
    default:
      return { title: id, why: '' };
  }
}

function buildCronFromVisual(
  mode: BuilderMode,
  everyMin: number,
  everyHour: number,
  hour: number,
  minute: number,
  dayOfWeek: number
): string {
  switch (mode) {
    case 'minutes':
      return `*/${Math.max(1, Math.min(59, everyMin))} * * * *`;
    case 'hours':
      return `0 */${Math.max(1, Math.min(23, everyHour))} * * *`;
    case 'daily':
      return `${minute} ${hour} * * *`;
    case 'weekly':
      return `${minute} ${hour} * * ${dayOfWeek}`;
    case 'reboot':
      return '@reboot';
  }
}

export default function SecurityCronPanel({ serverId, language, onToast }: SecurityCronPanelProps) {
  const ts = getSecurityCronStrings(language);
  const onToastRef = useRef(onToast);
  onToastRef.current = onToast;

  const [subTab, setSubTab] = useState<'security' | 'cron'>('security');

  // Security & SSL State
  const [audit, setAudit] = useState<main.SecurityAuditReport | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [copiedCheckId, setCopiedCheckId] = useState<string | null>(null);

  // Cron & Timers State
  const [tasks, setTasks] = useState<main.ScheduledTasksReport | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [busyLine, setBusyLine] = useState<number | null>(null);
  const [showCardRaw, setShowCardRaw] = useState<Record<number, boolean>>({});

  // Visual Cron Builder Form State
  const [formOpen, setFormOpen] = useState(false);
  const [editLineIndex, setEditLineIndex] = useState<number>(-1);
  const [builderMode, setBuilderMode] = useState<BuilderMode>('daily');
  const [everyMin, setEveryMin] = useState<number>(15);
  const [everyHour, setEveryHour] = useState<number>(2);
  const [pickHour, setPickHour] = useState<number>(3);
  const [pickMin, setPickMin] = useState<number>(0);
  const [pickDow, setPickDow] = useState<number>(0);
  const [showRawInput, setShowRawInput] = useState<boolean>(false);
  const [schedInput, setSchedInput] = useState('0 3 * * *');
  const [cmdInput, setCmdInput] = useState('');
  const [commentInput, setCommentInput] = useState('');
  const [savingCron, setSavingCron] = useState(false);

  // Monotonic request ids per loader: a slower request for the previous
  // server can resolve after switching servers (the first request pays the
  // SSH connection setup, the re-run reuses it and often finishes first);
  // only the newest response may touch the state.
  const auditSeqRef = useRef(0);
  const tasksSeqRef = useRef(0);

  const loadAudit = useCallback(async () => {
    const seq = ++auditSeqRef.current;
    setAuditLoading(true);
    try {
      const res = await GetSecurityAudit(serverId);
      if (seq !== auditSeqRef.current) return;
      setAudit(res);
    } catch (err) {
      if (seq !== auditSeqRef.current) return;
      onToastRef.current('error', String(err));
    } finally {
      if (seq === auditSeqRef.current) {
        setAuditLoading(false);
      }
    }
  }, [serverId]);

  const loadTasks = useCallback(async () => {
    const seq = ++tasksSeqRef.current;
    setTasksLoading(true);
    try {
      const res = await GetScheduledTasks(serverId);
      if (seq !== tasksSeqRef.current) return;
      setTasks(res);
    } catch (err) {
      if (seq !== tasksSeqRef.current) return;
      onToastRef.current('error', String(err));
    } finally {
      if (seq === tasksSeqRef.current) {
        setTasksLoading(false);
      }
    }
  }, [serverId]);

  useEffect(() => {
    tasksSeqRef.current++;
    setAudit(null);
    setTasks(null);
    // Reset the loading flags too: an in-flight request for the previous
    // server no longer writes them (stale responses are dropped above), and
    // the cron loader below only runs when !tasksLoading.
    setAuditLoading(false);
    setTasksLoading(false);
    setFormOpen(false);
    loadAudit();
  }, [serverId, loadAudit]);

  useEffect(() => {
    if (subTab === 'cron' && !tasks && !tasksLoading) {
      loadTasks();
    }
  }, [subTab, tasks, tasksLoading, loadTasks]);

  const syncVisualToExpr = (
    nextMode: BuilderMode,
    nextEM: number,
    nextEH: number,
    nextH: number,
    nextM: number,
    nextD: number
  ) => {
    setSchedInput(buildCronFromVisual(nextMode, nextEM, nextEH, nextH, nextM, nextD));
  };

  // Parse an existing cron expression back into the visual builder state so
  // editing a job never silently replaces its schedule with stale defaults.
  // Returns false when the expression cannot be represented visually (the
  // caller should then fall back to the raw-expression input).
  const syncBuilderFromSchedule = (schedule: string): boolean => {
    const s = schedule.trim();
    if (s === '@reboot') {
      setBuilderMode('reboot');
      return true;
    }
    const f = s.split(/\s+/);
    if (f.length !== 5 || f[2] !== '*' || f[3] !== '*') {
      return false;
    }
    const [min, hour, , , dow] = f;

    // Every N minutes: */N * * * *
    const everyMinMatch = /^\*\/(\d+)$/.exec(min);
    if (everyMinMatch && hour === '*' && dow === '*') {
      const v = Number(everyMinMatch[1]);
      if (v >= 1 && v <= 59) {
        setBuilderMode('minutes');
        setEveryMin(v);
        return true;
      }
      return false;
    }

    // Every N hours: 0 */N * * *
    const everyHourMatch = /^\*\/(\d+)$/.exec(hour);
    if (everyHourMatch && min === '0' && dow === '*') {
      const v = Number(everyHourMatch[1]);
      if (v >= 1 && v <= 23) {
        setBuilderMode('hours');
        setEveryHour(v);
        return true;
      }
      return false;
    }

    // Daily (M H * * *) or weekly (M H * * D) at a fixed time
    if (/^\d+$/.test(min) && /^\d+$/.test(hour)) {
      const m = Number(min);
      const h = Number(hour);
      if (m < 0 || m > 59 || h < 0 || h > 23) {
        return false;
      }
      if (dow === '*') {
        setBuilderMode('daily');
        setPickHour(h);
        setPickMin(m);
        return true;
      }
      if (/^\d+$/.test(dow)) {
        const d = Number(dow);
        if (d >= 0 && d <= 6) {
          setBuilderMode('weekly');
          setPickHour(h);
          setPickMin(m);
          setPickDow(d);
          return true;
        }
      }
    }
    return false;
  };

  const handleCopyFix = async (id: string, cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedCheckId(id);
      onToastRef.current('success', ts.copiedCmd);
      setTimeout(() => setCopiedCheckId(null), 1800);
    } catch {
      onToastRef.current('error', 'Clipboard unavailable');
    }
  };

  const handleToggleCron = async (job: main.CronJobItem) => {
    setBusyLine(job.lineIndex);
    try {
      const res = await ToggleCronJob(serverId, job.lineIndex, !job.enabled);
      if (res?.success) {
        onToastRef.current('success', res.message || 'Updated');
        await loadTasks();
      } else {
        onToastRef.current('error', res?.message || 'Failed');
      }
    } catch (err) {
      onToastRef.current('error', String(err));
    } finally {
      setBusyLine(null);
    }
  };

  const handleDeleteCron = async (job: main.CronJobItem) => {
    setBusyLine(job.lineIndex);
    try {
      const res = await DeleteCronJob(serverId, job.lineIndex);
      if (res?.success) {
        onToastRef.current('success', res.message || 'Deleted');
        await loadTasks();
      } else {
        onToastRef.current('error', res?.message || 'Failed');
      }
    } catch (err) {
      onToastRef.current('error', String(err));
    } finally {
      setBusyLine(null);
    }
  };

  const openAddForm = () => {
    setEditLineIndex(-1);
    setBuilderMode('daily');
    setEveryMin(15);
    setEveryHour(2);
    setPickHour(3);
    setPickMin(0);
    setPickDow(0);
    setSchedInput('0 3 * * *');
    setShowRawInput(false);
    setCmdInput('');
    setCommentInput('');
    setFormOpen(true);
  };

  const openEditForm = (job: main.CronJobItem) => {
    setEditLineIndex(job.lineIndex);
    setSchedInput(job.schedule);
    setCmdInput(job.command);
    setCommentInput(job.comment || '');
    // Hydrate the visual builder from the job's real schedule so clicking any
    // visual control continues from it instead of overwriting it with stale
    // defaults. Non-representable expressions fall back to the raw input.
    setShowRawInput(!syncBuilderFromSchedule(job.schedule));
    setFormOpen(true);
  };

  const handleSaveCron = async () => {
    if (!schedInput.trim() || !cmdInput.trim() || savingCron) return;
    setSavingCron(true);
    try {
      const res = await SaveCronJob(serverId, editLineIndex, schedInput.trim(), cmdInput.trim(), commentInput.trim());
      if (res?.success) {
        onToastRef.current('success', res.message || 'Saved');
        setFormOpen(false);
        await loadTasks();
      } else {
        onToastRef.current('error', res?.message || 'Save failed');
      }
    } catch (err) {
      onToastRef.current('error', String(err));
    } finally {
      setSavingCron(false);
    }
  };

  const scoreTone =
    (audit?.score ?? 0) >= 85
      ? 'text-emerald-300 border-emerald-400/35 bg-emerald-500/15'
      : (audit?.score ?? 0) >= 65
        ? 'text-amber-300 border-amber-400/35 bg-amber-500/15'
        : 'text-rose-300 border-rose-400/35 bg-rose-500/15';

  const weekDays = getWeekDays(language);

  return (
    <div className="space-y-5">
      {/* Sub-Tab Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/65 p-3 backdrop-blur-xl">
        <div className="flex rounded-xl border border-white/10 bg-slate-950/80 p-1 text-xs">
          <button
            type="button"
            onClick={() => setSubTab('security')}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 font-semibold transition ${
              subTab === 'security'
                ? 'bg-cyan-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {ts.subSecurity}
          </button>
          <button
            type="button"
            onClick={() => setSubTab('cron')}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 font-semibold transition ${
              subTab === 'cron'
                ? 'bg-indigo-500 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <CalendarClock className="h-3.5 w-3.5" />
            {ts.subCron}
          </button>
        </div>

        <button
          type="button"
          disabled={subTab === 'security' ? auditLoading : tasksLoading}
          onClick={() => (subTab === 'security' ? loadAudit() : loadTasks())}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${(subTab === 'security' ? auditLoading : tasksLoading) ? 'animate-spin' : ''}`} />
          {subTab === 'security' ? ts.runAudit : ts.refresh}
        </button>
      </div>

      {/* ==================== SECURITY & SSL AUDIT ==================== */}
      {subTab === 'security' && (
        <div className="space-y-5">
          {/* Score Banner */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/65 p-5">
            <div className="min-w-0 flex-1 space-y-2.5">
              <div>
                <h2 className="text-sm font-bold text-white">{ts.secTitle}</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{ts.secSubtitle}</p>
              </div>
              {/* Color Legend */}
              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-0.5 text-emerald-200">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  {ts.legendGreen}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-0.5 text-amber-200">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  {ts.legendYellow}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/25 bg-rose-500/10 px-2.5 py-0.5 text-rose-200">
                  <span className="h-2 w-2 rounded-full bg-rose-400" />
                  {ts.legendRed}
                </span>
              </div>
            </div>

            {audit && (
              <div className={`flex items-center gap-3 rounded-2xl border px-4 py-2.5 ${scoreTone}`}>
                <div className="text-center">
                  <div className="text-[10px] uppercase opacity-80">{ts.scoreLabel}</div>
                  <div dir="ltr" className="font-mono text-2xl font-black">
                    {audit.score}/100
                  </div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950/60 font-mono text-xl font-black">
                  {audit.grade}
                </div>
              </div>
            )}
          </div>

          {auditLoading && !audit && (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-900/50 p-10 text-xs text-slate-300">
              <RefreshCw className="h-4 w-4 animate-spin text-cyan-400" />
              <span>{ts.auditing}</span>
            </div>
          )}

          {audit && (
            <>
              {/* Security Checks Grid */}
              <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/65 p-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-200">{ts.checksTitle}</h3>
                <div className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-500/[0.07] px-3.5 py-2.5 text-[11px] leading-relaxed text-amber-100">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <span>{ts.secDisclaimer}</span>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {(audit.checks || []).map((c) => {
                    const meta = checkMeta(c.id, ts);
                    const icon =
                      c.status === 'pass' ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      ) : c.status === 'warn' ? (
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                      ) : (
                        <XCircle className="h-4 w-4 shrink-0 text-rose-400" />
                      );
                    const tone =
                      c.status === 'pass'
                        ? 'border-emerald-400/20 bg-emerald-500/[0.05]'
                        : c.status === 'warn'
                          ? 'border-amber-400/25 bg-amber-500/[0.06]'
                          : 'border-rose-400/30 bg-rose-500/[0.08]';
                    return (
                      <div key={c.id} className={`flex flex-col justify-between gap-2.5 rounded-xl border p-4 text-xs ${tone}`}>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 font-bold text-white">
                              {icon}
                              <span>{meta.title}</span>
                            </div>
                            <span dir="ltr" className="shrink-0 rounded-md bg-slate-950/60 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-200">
                              {c.points}/{c.maxPts}
                            </span>
                          </div>
                          <div dir="ltr" className="inline-block rounded bg-slate-950/50 px-2 py-0.5 font-mono text-[11px] text-slate-200">
                            {c.value}
                          </div>
                          {meta.why && (
                            <p className="text-[11px] leading-relaxed text-slate-300/90">
                              <span className="font-semibold text-slate-200">{ts.whyMattersLabel} </span>
                              {meta.why}
                            </p>
                          )}
                        </div>

                        {c.fixHint && (
                          <div className="space-y-1.5 rounded-lg border border-white/10 bg-slate-950/75 p-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-semibold text-amber-300">{ts.fixLabel}</span>
                              <button
                                type="button"
                                onClick={() => handleCopyFix(c.id, c.fixHint)}
                                className="inline-flex items-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-200 transition hover:bg-cyan-500/25"
                              >
                                {copiedCheckId === c.id ? (
                                  <Check className="h-3 w-3 text-emerald-300" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                                {copiedCheckId === c.id ? ts.copiedCmd : ts.copyCmd}
                              </button>
                            </div>
                            <pre dir="ltr" className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[10px] text-amber-100">
                              {c.fixHint}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SSL Certificates Section */}
              <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/65 p-4">
                <div>
                  <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-200">
                    <Lock className="h-4 w-4 text-cyan-400" />
                    {ts.sslTitle}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-slate-400">{ts.sslSub}</p>
                </div>

                {!audit.certs || audit.certs.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/40 p-5 text-center text-xs text-slate-400">
                    {ts.noCerts}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {audit.certs.map((cert, i) => {
                      const badge =
                        cert.status === 'expired'
                          ? 'border-rose-400/40 bg-rose-500/20 text-rose-200'
                          : cert.status === 'expiring'
                            ? 'border-amber-400/40 bg-amber-500/20 text-amber-200'
                            : 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200';
                      return (
                        <div
                          key={`${cert.domain}-${i}`}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/55 px-4 py-3 text-xs"
                        >
                          <div className="min-w-0">
                            <div dir="ltr" className="font-mono font-bold text-white">{cert.domain}</div>
                            <div dir="ltr" className="truncate font-mono text-[10px] text-slate-500">{cert.path}</div>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <span dir="ltr" className="font-mono text-[11px] text-slate-400">{cert.expiresAt}</span>
                            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${badge}`}>
                              {cert.daysLeft <= 0 ? ts.expired : `${cert.daysLeft} ${ts.daysLeft}`}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ==================== CRON & SYSTEMD TIMERS ==================== */}
      {subTab === 'cron' && (
        <div className="space-y-5">
          <div className="space-y-3.5 rounded-2xl border border-white/10 bg-slate-900/65 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-white">{ts.cronTitle}</h2>
                <p className="mt-0.5 text-xs text-slate-400">{ts.cronSubtitle}</p>
              </div>
              <button
                type="button"
                onClick={openAddForm}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-lg shadow-cyan-500/20 transition hover:brightness-110"
              >
                <Plus className="h-3.5 w-3.5" />
                {ts.addCronBtn}
              </button>
            </div>

            {/* Super-Simple Visual Cron Builder */}
            {formOpen && (
              <div className="space-y-4 rounded-2xl border border-cyan-400/30 bg-slate-950/85 p-4 text-xs">
                {/* Step 1: Visual Repeat Frequency */}
                <div className="space-y-2">
                  <div className="font-semibold text-slate-200">{ts.repeatLabel}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {([
                      { id: 'minutes', label: ts.modeMinutes },
                      { id: 'hours', label: ts.modeHours },
                      { id: 'daily', label: ts.modeDaily },
                      { id: 'weekly', label: ts.modeWeekly },
                      { id: 'reboot', label: ts.modeReboot },
                    ] as { id: BuilderMode; label: string }[]).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setBuilderMode(m.id);
                          syncVisualToExpr(m.id, everyMin, everyHour, pickHour, pickMin, pickDow);
                        }}
                        className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                          builderMode === m.id
                            ? 'border-cyan-400/50 bg-cyan-500/20 text-cyan-100'
                            : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step 2: Clean Contextual Time Pickers */}
                {builderMode === 'minutes' && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-slate-900/70 p-3">
                    <span className="text-slate-300">{ts.everyLabel}</span>
                    {[1, 5, 10, 15, 30].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          setEveryMin(v);
                          syncVisualToExpr('minutes', v, everyHour, pickHour, pickMin, pickDow);
                        }}
                        className={`rounded-lg border px-2.5 py-1 font-mono text-xs font-bold ${
                          everyMin === v
                            ? 'border-cyan-400/50 bg-cyan-500/25 text-white'
                            : 'border-white/10 bg-slate-950/60 text-slate-300 hover:text-white'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                    <span className="text-slate-300">{ts.minutesUnit}</span>
                  </div>
                )}

                {builderMode === 'hours' && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-slate-900/70 p-3">
                    <span className="text-slate-300">{ts.everyLabel}</span>
                    {[1, 2, 4, 6, 12].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          setEveryHour(v);
                          syncVisualToExpr('hours', everyMin, v, pickHour, pickMin, pickDow);
                        }}
                        className={`rounded-lg border px-2.5 py-1 font-mono text-xs font-bold ${
                          everyHour === v
                            ? 'border-cyan-400/50 bg-cyan-500/25 text-white'
                            : 'border-white/10 bg-slate-950/60 text-slate-300 hover:text-white'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                    <span className="text-slate-300">{ts.hoursUnit}</span>
                  </div>
                )}

                {(builderMode === 'daily' || builderMode === 'weekly') && (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-slate-900/70 p-3">
                    {builderMode === 'weekly' && (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-300">{ts.dayOfWeekLabel}:</span>
                        <select
                          value={pickDow}
                          onChange={(e) => {
                            const d = Number(e.target.value);
                            setPickDow(d);
                            syncVisualToExpr('weekly', everyMin, everyHour, pickHour, pickMin, d);
                          }}
                          className="rounded-lg border border-white/15 bg-slate-950 px-2.5 py-1 text-xs text-white outline-none"
                        >
                          {weekDays.map((d) => (
                            <option key={d.val} value={d.val}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-slate-300">{ts.atTimeLabel}:</span>
                      <div dir="ltr" className="flex items-center gap-1">
                        <select
                          value={pickHour}
                          onChange={(e) => {
                            const h = Number(e.target.value);
                            setPickHour(h);
                            syncVisualToExpr(builderMode, everyMin, everyHour, h, pickMin, pickDow);
                          }}
                          className="rounded-lg border border-white/15 bg-slate-950 px-2 py-1 font-mono text-xs text-cyan-200 outline-none"
                        >
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={i}>
                              {String(i).padStart(2, '0')}
                            </option>
                          ))}
                        </select>
                        <span className="font-mono text-slate-400">:</span>
                        <select
                          value={pickMin}
                          onChange={(e) => {
                            const m = Number(e.target.value);
                            setPickMin(m);
                            syncVisualToExpr(builderMode, everyMin, everyHour, pickHour, m, pickDow);
                          }}
                          className="rounded-lg border border-white/15 bg-slate-950 px-2 py-1 font-mono text-xs text-cyan-200 outline-none"
                        >
                          {[0, 5, 10, 15, 20, 30, 45].map((m) => (
                            <option key={m} value={m}>
                              {String(m).padStart(2, '0')}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Live Human-Readable Summary + Optional Raw Toggle */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.07] px-3 py-2">
                  <div className="flex items-center gap-2 text-emerald-200">
                    <Clock className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-[11px] opacity-80">{ts.previewLabel}</span>
                    <span className="font-bold">{describeCronSchedule(schedInput, language)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowRawInput((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-slate-950/60 px-2.5 py-1 text-[10px] text-slate-300 hover:text-white"
                  >
                    <Code2 className="h-3 w-3" />
                    {showRawInput ? ts.hideRawCron : ts.showRawCron}
                  </button>
                </div>

                {showRawInput && (
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-400">{ts.scheduleLabel}</label>
                    <input
                      dir="ltr"
                      value={schedInput}
                      onChange={(e) => setSchedInput(e.target.value)}
                      className="w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-1.5 font-mono text-xs text-cyan-200 outline-none focus:border-cyan-400"
                    />
                  </div>
                )}

                {/* Ready-Made Command Templates */}
                <div className="space-y-1.5">
                  <div className="text-[11px] text-slate-400">{ts.cmdTemplatesLabel}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: ts.tplDockerPrune, cmd: 'docker system prune -af --filter "until=168h"' },
                      { label: ts.tplSslRenew, cmd: 'certbot renew --quiet' },
                      { label: ts.tplVacuumLogs, cmd: 'journalctl --vacuum-time=7d' },
                      { label: ts.tplAptUpdate, cmd: 'apt-get update -qq' },
                      { label: ts.tplReboot, cmd: '/sbin/reboot' },
                    ].map((tpl) => (
                      <button
                        key={tpl.cmd}
                        type="button"
                        onClick={() => {
                          setCmdInput(tpl.cmd);
                          setCommentInput(tpl.label);
                        }}
                        className="rounded-lg border border-indigo-400/25 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-200 transition hover:bg-indigo-500/25 hover:text-white"
                      >
                        + {tpl.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Command & Optional Name */}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-300">{ts.commandLabel}</label>
                    <input
                      dir="ltr"
                      value={cmdInput}
                      onChange={(e) => setCmdInput(e.target.value)}
                      placeholder={ts.commandPlaceholder}
                      className="w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 font-mono text-xs text-white outline-none focus:border-cyan-400"
                    />
                  </div>
                  {editLineIndex < 0 && (
                    <div>
                      <label className="mb-1 block text-[11px] text-slate-300">{ts.commentLabel}</label>
                      <input
                        value={commentInput}
                        onChange={(e) => setCommentInput(e.target.value)}
                        placeholder={ts.commentPlaceholder}
                        className="w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-cyan-400"
                      />
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setFormOpen(false)}
                    className="rounded-lg border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs text-slate-300 hover:bg-white/10"
                  >
                    {ts.cancelBtn}
                  </button>
                  <button
                    type="button"
                    disabled={savingCron || !schedInput.trim() || !cmdInput.trim()}
                    onClick={handleSaveCron}
                    className="rounded-lg bg-cyan-500 px-4 py-1.5 text-xs font-bold text-slate-950 hover:brightness-110 disabled:opacity-40"
                  >
                    {ts.saveCronBtn}
                  </button>
                </div>
              </div>
            )}

            {/* User Cron Jobs List */}
            {!tasks || (tasks.cronJobs || []).length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/40 p-6 text-center text-xs text-slate-400">
                {ts.noCronJobs}
              </div>
            ) : (
              <div className="space-y-2">
                {tasks.cronJobs.map((job) => (
                  <div
                    key={`${job.lineIndex}-${job.command}`}
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5 text-xs transition ${
                      job.enabled
                        ? 'border-white/10 bg-slate-950/60'
                        : 'border-white/5 bg-slate-950/30 opacity-65'
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md border border-cyan-400/30 bg-cyan-500/15 px-2.5 py-0.5 text-[11px] font-bold text-cyan-200">
                          {describeCronSchedule(job.schedule, language)}
                        </span>
                        {job.comment && (
                          <span className="font-semibold text-white">{job.comment}</span>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setShowCardRaw((prev) => ({ ...prev, [job.lineIndex]: !prev[job.lineIndex] }))
                          }
                          className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 hover:text-white"
                          title={ts.showRawCron}
                        >
                          {showCardRaw[job.lineIndex] ? job.schedule : 'cron'}
                        </button>
                      </div>
                      <div dir="ltr" className="truncate font-mono text-[11px] text-slate-300">
                        {job.command}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={busyLine === job.lineIndex}
                        onClick={() => handleToggleCron(job)}
                        className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                          job.enabled
                            ? 'border-emerald-400/35 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                            : 'border-slate-500/35 bg-slate-500/15 text-slate-300 hover:bg-slate-500/25'
                        }`}
                      >
                        {job.enabled ? ts.enabled : ts.disabled}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditForm(job)}
                        className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={busyLine === job.lineIndex}
                        onClick={() => handleDeleteCron(job)}
                        className="rounded-lg border border-rose-400/20 bg-rose-500/10 p-1.5 text-rose-300 hover:bg-rose-500/20"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Systemd Timers (Read-Only with Human Descriptions) */}
          <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/65 p-4">
            <div className="space-y-2">
              <div>
                <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-200">
                  <Clock className="h-4 w-4 text-indigo-400" />
                  {ts.timersTitle}
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-400">{ts.timersSub}</p>
              </div>
              <div className="flex items-start gap-2 rounded-xl border border-indigo-400/20 bg-indigo-500/[0.06] px-3 py-2 text-[11px] text-indigo-100/90">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-300" />
                <span>{ts.timersInfoBanner}</span>
              </div>
            </div>

            {!tasks || (tasks.timers || []).length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/40 p-5 text-center text-xs text-slate-400">
                {ts.noTimers}
              </div>
            ) : (
              <div className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-slate-950/50">
                {tasks.timers.map((tm, i) => {
                  const hasNext = tm.nextRun && tm.nextRun !== '-' && tm.nextRun !== 'n/a';
                  return (
                    <div
                      key={`${tm.unit}-${i}`}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs transition hover:bg-white/[0.02]"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span dir="ltr" className="inline-block font-mono font-bold text-white">
                            {tm.unit}
                          </span>
                          {tm.activates && (
                            <span dir="ltr" className="inline-block rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                              {tm.activates}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] leading-relaxed text-slate-400">
                          {describeSystemdTimer(tm.unit, language)}
                        </p>
                      </div>
                      <span
                        dir={hasNext ? 'ltr' : undefined}
                        className={`shrink-0 rounded-lg border px-2.5 py-1 font-mono text-[10px] ${
                          hasNext
                            ? 'border-indigo-400/25 bg-indigo-500/10 text-indigo-200'
                            : 'border-white/10 bg-white/5 text-slate-400'
                        }`}
                      >
                        {hasNext ? tm.nextRun : ts.timerInactive}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}