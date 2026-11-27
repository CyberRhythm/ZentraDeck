import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Bookmark,
  Box,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  FileText,
  HardDrive,
  Info,
  Network,
  Package,
  Pencil,
  Play,
  Plus,
  Radio,
  Shield,
  Trash2,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import {
  BroadcastCommand,
  DeleteSnippet,
  GetSnippets,
  SaveSnippet,
} from '../wailsjs/go/main/App';
import { main } from '../wailsjs/go/models';
import { getBroadcastStrings, localizeSnippet, type BroadcastStrings } from './broadcastI18n';
import { sanitizeErrorText } from './errorExplain';

interface BroadcastSnippetsModalProps {
  open: boolean;
  servers: main.ServerConfig[];
  language: string;
  privacyMode: boolean;
  onClose: () => void;
  onToast: (type: 'success' | 'error', message: string) => void;
}

const DANGER_REGEX = /\b(rm\s+-rf|reboot|shutdown|poweroff|mkfs|dd\s+if=|halt)\b/i;

type CategoryId = 'all' | 'system' | 'storage' | 'network' | 'docker' | 'security' | 'logs' | 'packages' | 'custom';

function getCategoryMeta(cat: string, tb: BroadcastStrings): { label: string; icon: ReactNode; badgeClass: string } {
  switch (cat) {
    case 'system':
      return { label: tb.catSystem, icon: <Cpu className="h-3.5 w-3.5" />, badgeClass: 'border-cyan-400/30 bg-cyan-500/15 text-cyan-200' };
    case 'storage':
      return { label: tb.catStorage, icon: <HardDrive className="h-3.5 w-3.5" />, badgeClass: 'border-amber-400/30 bg-amber-500/15 text-amber-200' };
    case 'network':
      return { label: tb.catNetwork, icon: <Network className="h-3.5 w-3.5" />, badgeClass: 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200' };
    case 'docker':
      return { label: tb.catDocker, icon: <Box className="h-3.5 w-3.5" />, badgeClass: 'border-sky-400/30 bg-sky-500/15 text-sky-200' };
    case 'security':
      return { label: tb.catSecurity, icon: <Shield className="h-3.5 w-3.5" />, badgeClass: 'border-rose-400/30 bg-rose-500/15 text-rose-200' };
    case 'logs':
      return { label: tb.catLogs, icon: <FileText className="h-3.5 w-3.5" />, badgeClass: 'border-purple-400/30 bg-purple-500/15 text-purple-200' };
    case 'packages':
      return { label: tb.catPackages, icon: <Package className="h-3.5 w-3.5" />, badgeClass: 'border-indigo-400/30 bg-indigo-500/15 text-indigo-200' };
    default:
      return { label: tb.catCustom, icon: <Wrench className="h-3.5 w-3.5" />, badgeClass: 'border-slate-400/30 bg-slate-500/15 text-slate-200' };
  }
}

export default function BroadcastSnippetsModal({
  open,
  servers,
  language,
  privacyMode,
  onClose,
  onToast,
}: BroadcastSnippetsModalProps) {
  const tb = getBroadcastStrings(language);
  const isRtl = language === 'fa';

  const [tab, setTab] = useState<'broadcast' | 'snippets'>('broadcast');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [command, setCommand] = useState('uptime && uname -sr');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<main.BroadcastResult[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Snippets Vault State
  const [snippets, setSnippets] = useState<main.CommandSnippet[]>([]);
  const [activeCategory, setActiveCategory] = useState<CategoryId>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [snipTitle, setSnipTitle] = useState('');
  const [snipCmd, setSnipCmd] = useState('');
  const [snipDesc, setSnipDesc] = useState('');
  const [snipCat, setSnipCat] = useState('custom');

  const loadSnippets = useCallback(async () => {
    try {
      const list = await GetSnippets();
      setSnippets(list || []);
    } catch {
      setSnippets([]);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadSnippets();
      setSelectedIds((prev) => {
        const valid = prev.filter((id) => servers.some((s) => s.id === id));
        return valid.length > 0 ? valid : servers.map((s) => s.id);
      });
    }
  }, [open, servers, loadSnippets]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const isDangerous = useMemo(() => DANGER_REGEX.test(command), [command]);

  const matchedSnippet = useMemo(() => {
    const trimmed = command.trim();
    if (!trimmed) return null;
    const found = snippets.find((s) => s.command.trim() === trimmed);
    if (!found) return null;
    return {
      ...found,
      loc: localizeSnippet(found, language),
    };
  }, [command, snippets, language]);

  const filteredSnippets = useMemo(() => {
    if (activeCategory === 'all') return snippets;
    return snippets.filter((s) => (s.category || 'custom') === activeCategory);
  }, [snippets, activeCategory]);

  if (!open) return null;

  const categories: { id: CategoryId; label: string; icon: ReactNode }[] = [
    { id: 'all', label: tb.catAll, icon: <Bookmark className="h-3.5 w-3.5" /> },
    { id: 'system', label: tb.catSystem, icon: <Cpu className="h-3.5 w-3.5" /> },
    { id: 'storage', label: tb.catStorage, icon: <HardDrive className="h-3.5 w-3.5" /> },
    { id: 'network', label: tb.catNetwork, icon: <Network className="h-3.5 w-3.5" /> },
    { id: 'docker', label: tb.catDocker, icon: <Box className="h-3.5 w-3.5" /> },
    { id: 'security', label: tb.catSecurity, icon: <Shield className="h-3.5 w-3.5" /> },
    { id: 'logs', label: tb.catLogs, icon: <FileText className="h-3.5 w-3.5" /> },
    { id: 'packages', label: tb.catPackages, icon: <Package className="h-3.5 w-3.5" /> },
    { id: 'custom', label: tb.catCustom, icon: <Wrench className="h-3.5 w-3.5" /> },
  ];

  const toggleServer = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleRunBroadcast = async () => {
    if (running || selectedIds.length === 0 || !command.trim()) return;
    setRunning(true);
    setResults([]);
    try {
      const res = await BroadcastCommand(selectedIds, command.trim());
      setResults(res || []);
    } catch (err) {
      onToast('error', String(err));
    } finally {
      setRunning(false);
    }
  };

  const handleCopyOutput = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      onToast('success', tb.copied);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      onToast('error', 'Clipboard unavailable');
    }
  };

  const openNewSnippet = () => {
    setEditId('');
    setSnipTitle('');
    setSnipCmd('');
    setSnipDesc('');
    setSnipCat(activeCategory === 'all' ? 'custom' : activeCategory);
    setFormOpen(true);
  };

  const openEditSnippet = (sn: main.CommandSnippet) => {
    // Prefill from the STORED values, not the localized display text:
    // built-ins render through localizeSnippet, and prefilling the localized
    // pair would silently discard the user's saved custom title/description
    // the moment they save without retyping them.
    setEditId(sn.id);
    setSnipTitle(sn.title);
    setSnipCmd(sn.command);
    setSnipDesc(sn.description || '');
    setSnipCat(sn.category || 'custom');
    setFormOpen(true);
  };

  const handleSaveSnippet = async () => {
    if (!snipTitle.trim() || !snipCmd.trim()) return;
    try {
      const res = await SaveSnippet(
        main.CommandSnippet.createFrom({
          id: editId,
          title: snipTitle.trim(),
          command: snipCmd.trim(),
          description: snipDesc.trim(),
          category: snipCat,
        })
      );
      if (res?.success) {
        onToast('success', res.message || 'Saved');
        setFormOpen(false);
        await loadSnippets();
      } else {
        onToast('error', res?.message || 'Save failed');
      }
    } catch (err) {
      onToast('error', String(err));
    }
  };

  const handleDeleteSnippet = async (id: string) => {
    try {
      const res = await DeleteSnippet(id);
      if (res?.success) {
        await loadSnippets();
      }
    } catch (err) {
      onToast('error', String(err));
    }
  };

  return createPortal(
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md"
    >
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-900/95 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-400/30 bg-indigo-500/15 text-indigo-300">
              <Radio className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">{tb.modalTitle}</h2>
              <p className="text-[11px] text-slate-400">{tb.modalSub}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            title={tb.close}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex items-center gap-2 border-b border-white/10 bg-slate-950/50 px-5 py-2.5 text-xs">
          <button
            type="button"
            onClick={() => setTab('broadcast')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 font-semibold transition ${
              tab === 'broadcast'
                ? 'bg-cyan-500 text-slate-950 shadow'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Radio className="h-3.5 w-3.5" />
            {tb.tabBroadcast}
          </button>
          <button
            type="button"
            onClick={() => setTab('snippets')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 font-semibold transition ${
              tab === 'snippets'
                ? 'bg-indigo-500 text-white shadow'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Bookmark className="h-3.5 w-3.5" />
            {tb.tabSnippets} ({snippets.length})
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5 text-xs">
          {tab === 'broadcast' && (
            <>
              {/* Server Picker */}
              <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-white">
                    {tb.selectServers} ({selectedIds.length}/{servers.length})
                  </span>
                  <div className="flex gap-1.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setSelectedIds(servers.map((s) => s.id))}
                      className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300 hover:bg-white/10 hover:text-white"
                    >
                      {tb.selectAll}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedIds([])}
                      className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300 hover:bg-white/10 hover:text-white"
                    >
                      {tb.selectNone}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {servers.map((s) => {
                    const active = selectedIds.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleServer(s.id)}
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                          active
                            ? 'border-cyan-400/45 bg-cyan-500/20 text-cyan-100'
                            : 'border-white/10 bg-slate-950/60 text-slate-400 hover:text-white'
                        }`}
                      >
                        <span className={`h-2 w-2 rounded-full ${active ? 'bg-cyan-400' : 'bg-slate-600'}`} />
                        <span>{s.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quick Snippets Strip (Localized with Category Icons) */}
              {snippets.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-medium text-slate-400">{tb.quickCommandsLabel}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {snippets.slice(0, 10).map((sn) => {
                      const loc = localizeSnippet(sn, language);
                      const cm = getCategoryMeta(sn.category, tb);
                      const isSelected = command.trim() === sn.command.trim();
                      return (
                        <button
                          key={sn.id}
                          type="button"
                          onClick={() => setCommand(sn.command)}
                          title={loc.description}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                            isSelected
                              ? 'border-cyan-400/50 bg-cyan-500/20 text-white shadow-sm'
                              : 'border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/25 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {cm.icon}
                          <span>{loc.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Command Input + Live Localized Explanation */}
              <div className="space-y-2">
                <label className="block font-semibold text-slate-200">{tb.commandLabel}</label>
                <div className="flex flex-wrap gap-2">
                  <input
                    dir="ltr"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleRunBroadcast();
                    }}
                    placeholder={tb.commandPlaceholder}
                    className="min-w-0 flex-1 rounded-xl border border-white/15 bg-slate-950 px-3.5 py-2.5 font-mono text-xs text-cyan-200 outline-none focus:border-cyan-400"
                  />
                  <button
                    type="button"
                    disabled={running || selectedIds.length === 0 || !command.trim()}
                    onClick={handleRunBroadcast}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:brightness-110 disabled:opacity-40"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    {running ? tb.running : tb.runBroadcast}
                  </button>
                </div>

                {matchedSnippet && matchedSnippet.loc.description && (
                  <div className="flex items-start gap-2 rounded-xl border border-cyan-400/25 bg-cyan-500/[0.08] px-3.5 py-2.5 text-[11px] leading-relaxed text-cyan-100">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                    <div>
                      <span className="font-bold text-white">{tb.selectedCmdInfo} </span>
                      <span>{matchedSnippet.loc.description}</span>
                    </div>
                  </div>
                )}

                {isDangerous && (
                  <div className="flex items-start gap-2 rounded-xl border border-rose-400/35 bg-rose-500/15 px-3 py-2 text-[11px] text-rose-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                    <span>{tb.dangerWarning}</span>
                  </div>
                )}
              </div>

              {/* Execution Results */}
              {results.length > 0 && (
                <div className="space-y-2.5">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-300">
                    {tb.resultsTitle} ({results.filter((r) => r.success).length}/{results.length})
                  </h3>
                  <div className="space-y-2.5">
                    {results.map((r) => {
                      const body = sanitizeErrorText(r.output || r.error || '', privacyMode);
                      return (
                        <div
                          key={r.serverId}
                          className={`rounded-xl border p-3.5 ${
                            r.success
                              ? 'border-emerald-400/20 bg-slate-950/75'
                              : 'border-rose-400/30 bg-rose-950/20'
                          }`}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 font-bold text-white">
                              {r.success ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                              ) : (
                                <XCircle className="h-4 w-4 text-rose-400" />
                              )}
                              <span>{r.serverName}</span>
                              <span dir="ltr" className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                                {r.durationMs} ms
                              </span>
                            </div>
                            {body && (
                              <button
                                type="button"
                                onClick={() => handleCopyOutput(r.serverId, body)}
                                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-white/10 hover:text-white"
                              >
                                {copiedId === r.serverId ? <Check className="h-3 w-3 text-emerald-300" /> : <Copy className="h-3 w-3" />}
                                {copiedId === r.serverId ? tb.copied : tb.copyOutput}
                              </button>
                            )}
                          </div>
                          <pre
                            dir="ltr"
                            className="max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-950/90 p-2.5 font-mono text-[11px] text-slate-200"
                          >
                            {body || '(empty output)'}
                          </pre>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'snippets' && (
            <div className="space-y-3.5">
              {/* Category Filter Bar + Add Button */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((cat) => {
                    const count =
                      cat.id === 'all'
                        ? snippets.length
                        : snippets.filter((s) => (s.category || 'custom') === cat.id).length;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setActiveCategory(cat.id)}
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                          activeCategory === cat.id
                            ? 'border-cyan-400/50 bg-cyan-500/20 text-white'
                            : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-white'
                        }`}
                      >
                        {cat.icon}
                        <span>{cat.label}</span>
                        <span className="rounded-full bg-slate-950/60 px-1.5 text-[10px] text-slate-300">{count}</span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={openNewSnippet}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-3.5 py-1.5 text-xs font-bold text-white shadow transition hover:brightness-110"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {tb.addSnippet}
                </button>
              </div>

              {formOpen && (
                <div className="space-y-3 rounded-xl border border-indigo-400/30 bg-slate-950/85 p-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[11px] text-slate-400">{tb.snippetTitle}</label>
                      <input
                        value={snipTitle}
                        onChange={(e) => setSnipTitle(e.target.value)}
                        className="w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-400"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-slate-400">{tb.snippetCategory}</label>
                      <select
                        value={snipCat}
                        onChange={(e) => setSnipCat(e.target.value)}
                        className="w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-1.5 text-xs text-white outline-none"
                      >
                        <option value="system">{tb.catSystem}</option>
                        <option value="storage">{tb.catStorage}</option>
                        <option value="network">{tb.catNetwork}</option>
                        <option value="docker">{tb.catDocker}</option>
                        <option value="security">{tb.catSecurity}</option>
                        <option value="logs">{tb.catLogs}</option>
                        <option value="packages">{tb.catPackages}</option>
                        <option value="custom">{tb.catCustom}</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-400">{tb.snippetCmd}</label>
                    <input
                      dir="ltr"
                      value={snipCmd}
                      onChange={(e) => setSnipCmd(e.target.value)}
                      className="w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-1.5 font-mono text-xs text-cyan-200 outline-none focus:border-cyan-400"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-400">{tb.snippetDesc}</label>
                    <input
                      value={snipDesc}
                      onChange={(e) => setSnipDesc(e.target.value)}
                      className="w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-400"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setFormOpen(false)}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300"
                    >
                      {tb.cancel}
                    </button>
                    <button
                      type="button"
                      disabled={!snipTitle.trim() || !snipCmd.trim()}
                      onClick={handleSaveSnippet}
                      className="rounded-lg bg-cyan-500 px-4 py-1.5 text-xs font-bold text-slate-950 disabled:opacity-40"
                    >
                      {tb.saveSnippet}
                    </button>
                  </div>
                </div>
              )}

              {filteredSnippets.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-slate-400">
                  {tb.noSnippets}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredSnippets.map((sn) => {
                    const loc = localizeSnippet(sn, language);
                    const cm = getCategoryMeta(sn.category, tb);
                    return (
                      <div
                        key={sn.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/60 p-3.5 transition hover:border-white/20"
                      >
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-bold ${cm.badgeClass}`}>
                              {cm.icon}
                              <span>{cm.label}</span>
                            </span>
                            <span className="font-bold text-white">{loc.title}</span>
                          </div>
                          {loc.description && (
                            <p className="text-[11px] leading-relaxed text-slate-300">{loc.description}</p>
                          )}
                          <div dir="ltr" className="inline-block max-w-full truncate rounded-md bg-slate-900/90 px-2.5 py-1 font-mono text-[11px] text-cyan-200">
                            {sn.command}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setCommand(sn.command);
                              setTab('broadcast');
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-cyan-400/30 bg-cyan-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/25"
                          >
                            <Play className="h-3 w-3" />
                            {tb.useInBroadcast}
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditSnippet(sn)}
                            className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-300 hover:text-white"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSnippet(sn.id)}
                            className="rounded-lg border border-rose-400/20 bg-rose-500/10 p-1.5 text-rose-300 hover:bg-rose-500/20"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}