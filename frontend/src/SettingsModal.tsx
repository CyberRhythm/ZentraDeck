import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  Bug,
  Cpu,
  FolderArchive,
  FolderOpen,
  Globe,
  HardDrive,
  Heart,
  Info,
  Lock,
  Power,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sliders,
  Star,
  Trash2,
  User,
  X,
} from 'lucide-react';
import {
  QuitApp,
  GetReportExportInfo,
  SelectBackupDir,
  SelectReportDir,
  SendTestNotification,
  SFTPClearBackups,
  SFTPGetBackupStats,
  ExportServersEncrypted,
  ImportServersEncrypted,
} from '../wailsjs/go/main/App';
import { main } from '../wailsjs/go/models';
import { BrowserOpenURL } from '../wailsjs/runtime/runtime';
import { LANGUAGES } from './i18n';
import { formatLocalBytes, getSettingsStrings } from './settingsI18n';

export type SettingsTab = 'general' | 'sftp' | 'alerts' | 'backup' | 'about';

interface SettingsModalProps {
  open: boolean;
  initialTab: SettingsTab;
  settings: main.AppSettings;
  appVersion: string;
  simpleLabel: string;
  proLabel: string;
  onClose: () => void;
  onUpdateSettings: (patch: Partial<main.AppSettings>) => void;
  onServersImported: () => void;
  onOpenSupport: () => void;
  onToast: (type: 'success' | 'error', message: string) => void;
}

const POLL_OPTIONS = [1, 2, 3, 5, 10, 30];
const MAX_BACKUP_OPTIONS = [3, 5, 10, 20];

export default function SettingsModal({
  open,
  initialTab,
  settings,
  appVersion,
  simpleLabel,
  proLabel,
  onClose,
  onUpdateSettings,
  onServersImported,
  onOpenSupport,
  onToast,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [backupStats, setBackupStats] = useState<{
    totalCount: number;
    totalBytes: number;
    backupDir: string;
    isCustomDir: boolean;
  }>({
    totalCount: 0,
    totalBytes: 0,
    backupDir: '',
    isCustomDir: false,
  });
  const [clearing, setClearing] = useState(false);
  const [reportInfo, setReportInfo] = useState<{ exportDir: string; isCustomDir: boolean; format: string }>({ exportDir: '', isCustomDir: false, format: 'md' });
  const [customLimitInput, setCustomLimitInput] = useState(String(settings.sftpMaxBackups || 5));

  const ts = getSettingsStrings(settings.language || 'en');
  const isRtl = settings.language === 'fa';

  const refreshStats = useCallback(() => {
    GetReportExportInfo().then((ri) => { if (ri) setReportInfo({ exportDir: ri.exportDir || '', isCustomDir: !!ri.isCustomDir, format: ri.format || 'md' }); }).catch(() => {});
    SFTPGetBackupStats()
      .then((st) => {
        if (st) {
          setBackupStats({
            totalCount: st.totalCount || 0,
            totalBytes: st.totalBytes || 0,
            backupDir: st.backupDir || '',
            isCustomDir: !!st.isCustomDir,
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (open) {
      setCustomLimitInput(String(settings.sftpMaxBackups >= 1 ? settings.sftpMaxBackups : 5));
      refreshStats();
    }
  }, [open, settings.sftpBackupDir, settings.sftpMaxBackups, settings.reportExportDir, settings.reportExportFormat, refreshStats]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleChooseBackupDir = async () => {
    try {
      const picked = await SelectBackupDir();
      if (picked && picked.trim()) {
        onUpdateSettings({ sftpBackupDir: picked.trim() });
        setTimeout(refreshStats, 150);
      }
    } catch (err) {
      onToast('error', String(err));
    }
  };

  const handleChooseReportDir = async () => {
    try {
      const picked = await SelectReportDir();
      if (picked && picked.trim()) {
        onUpdateSettings({ reportExportDir: picked.trim() });
        setTimeout(refreshStats, 150);
      }
    } catch (err) {
      onToast('error', String(err));
    }
  };

  const handleResetReportDir = () => {
    onUpdateSettings({ reportExportDir: '' });
    setTimeout(refreshStats, 150);
  };

  const handleResetBackupDir = () => {
    onUpdateSettings({ sftpBackupDir: '' });
    setTimeout(refreshStats, 150);
  };

  const handleCustomLimitCommit = (raw: string) => {
    setCustomLimitInput(raw);
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= 1000) {
      onUpdateSettings({ sftpMaxBackups: n });
    }
  };

  const handleClearAllBackups = async () => {
    if (clearing || backupStats.totalCount === 0) return;
    setClearing(true);
    try {
      const res = await SFTPClearBackups('');
      if (res?.success) {
        refreshStats();
        onToast('success', ts.sftpClearDone);
      } else {
        onToast('error', res?.message || 'Failed');
      }
    } catch (err) {
      onToast('error', String(err));
    } finally {
      setClearing(false);
    }
  };

  const handleTestNotification = async () => {
    try {
      const res = await SendTestNotification();
      if (res?.success) {
        onToast('success', ts.testNotificationSent);
      } else {
        onToast('error', res?.message || 'Failed');
      }
    } catch (err) {
      onToast('error', String(err));
    }
  };

  // --- Encrypted inventory export / import ---
  const [exportPw, setExportPw] = useState('');
  const [exportPwConfirm, setExportPwConfirm] = useState('');
  const [importPw, setImportPw] = useState('');
  const [backupBusy, setBackupBusy] = useState<'export' | 'import' | null>(null);

  const handleExportInventory = useCallback(async () => {
    if (exportPw.length < 8) {
      onToast('error', ts.passwordTooShort.replace('{n}', '8'));
      return;
    }
    if (exportPw !== exportPwConfirm) {
      onToast('error', ts.passwordMismatch);
      return;
    }
    setBackupBusy('export');
    try {
      const path = await ExportServersEncrypted(exportPw);
      if (path) {
        onToast('success', ts.exportDone.replace('{path}', path));
        setExportPw('');
        setExportPwConfirm('');
      }
    } catch (err) {
      onToast('error', String(err));
    } finally {
      setBackupBusy(null);
    }
  }, [exportPw, exportPwConfirm, onToast, ts]);

  const handleImportInventory = useCallback(async () => {
    if (importPw.length < 8) {
      onToast('error', ts.passwordTooShort.replace('{n}', '8'));
      return;
    }
    setBackupBusy('import');
    try {
      const summary = await ImportServersEncrypted(importPw);
      if (summary && !summary.cancelled) {
        onToast(
          'success',
          ts.importDone
            .replace('{a}', String(summary.added))
            .replace('{u}', String(summary.updated))
        );
        setImportPw('');
        onServersImported();
      }
    } catch (err) {
      onToast('error', String(err));
    } finally {
      setBackupBusy(null);
    }
  }, [importPw, onToast, ts, onServersImported]);

  const tabs: { id: SettingsTab; label: string; icon: ReactNode }[] = [
    { id: 'general', label: ts.tabGeneral, icon: <Sliders className="h-4 w-4" /> },
    { id: 'sftp', label: ts.tabSftp, icon: <FolderArchive className="h-4 w-4" /> },
    { id: 'backup', label: ts.tabBackup, icon: <Lock className="h-4 w-4" /> },
    { id: 'alerts', label: ts.tabAlerts, icon: <Bell className="h-4 w-4" /> },
    { id: 'about', label: ts.tabAbout, icon: <Info className="h-4 w-4" /> },
  ];

  const maxBackups = settings.sftpMaxBackups >= 1 ? settings.sftpMaxBackups : 5;
  const keepAll = !!settings.sftpKeepAllBackups;

  return createPortal(
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md"
    >
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-900/95 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/15 text-cyan-300">
              <Settings className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">{ts.settingsTitle}</h2>
              <p className="text-[11px] text-slate-400">{ts.settingsSubtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            title={ts.close}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-[410px] flex-1 flex-col overflow-hidden sm:flex-row">
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 bg-slate-950/40 p-2.5 sm:w-56 sm:flex-col sm:border-b-0 sm:border-e">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition ${
                  activeTab === item.id
                    ? 'border border-cyan-400/30 bg-cyan-500/15 text-cyan-200 shadow-sm'
                    : 'border border-transparent text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="flex-1 space-y-3.5 overflow-y-auto p-5 text-xs">
            {/* GENERAL TAB */}
            {activeTab === 'general' && (
              <>
                <div className="space-y-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-cyan-400" />
                    <div>
                      <div className="font-semibold text-white">{ts.languageLabel}</div>
                      <div className="text-[11px] text-slate-400">{ts.languageDesc}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {LANGUAGES.map((item) => (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => onUpdateSettings({ language: item.code })}
                        className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-start text-[11px] transition ${
                          settings.language === item.code
                            ? 'border-cyan-400/40 bg-cyan-500/20 font-semibold text-white'
                            : 'border-white/10 bg-slate-950/50 text-slate-300 hover:border-white/20 hover:text-white'
                        }`}
                      >
                        <span className="truncate">{item.name}</span>
                        <span className="ms-1 text-[10px] uppercase text-slate-400">{item.code}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                  <div>
                    <div className="font-semibold text-white">{ts.defaultViewLabel}</div>
                    <div className="text-[11px] text-slate-400">{ts.defaultViewDesc}</div>
                  </div>
                  <div className="flex rounded-xl border border-white/10 bg-slate-950/80 p-0.5">
                    <button
                      type="button"
                      onClick={() => onUpdateSettings({ viewMode: 'simple' })}
                      className={`rounded-lg px-3 py-1 font-medium transition ${
                        settings.viewMode !== 'pro'
                          ? 'bg-indigo-500 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {simpleLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateSettings({ viewMode: 'pro' })}
                      className={`rounded-lg px-3 py-1 font-medium transition ${
                        settings.viewMode === 'pro'
                          ? 'bg-cyan-500 text-slate-950'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {proLabel}
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                  <div>
                    <div className="font-semibold text-white">{ts.pollIntervalLabel}</div>
                    <div className="text-[11px] text-slate-400">{ts.pollIntervalDesc}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {POLL_OPTIONS.map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => onUpdateSettings({ pollIntervalSec: sec })}
                        className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition ${
                          (settings.pollIntervalSec || 2) === sec
                            ? 'border-cyan-400/40 bg-cyan-500/20 text-cyan-200'
                            : 'border-white/10 bg-slate-950/50 text-slate-300 hover:border-white/20 hover:text-white'
                        }`}
                      >
                        {sec} {ts.secondsShort}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                  <div>
                    <div className="font-semibold text-white">{ts.privacyModeLabel}</div>
                    <div className="text-[11px] text-slate-400">{ts.privacyModeDesc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={!!settings.privacyMode}
                    onChange={(e) => onUpdateSettings({ privacyMode: e.target.checked })}
                    className="h-4 w-4 accent-cyan-400"
                  />
                </label>
              </>
            )}

            {/* SFTP & BACKUPS TAB */}
            {activeTab === 'sftp' && (
              <>
                <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-cyan-400/25 bg-cyan-500/[0.06] p-3.5">
                  <div className="space-y-1">
                    <div className="font-semibold text-white">{ts.sftpAutoBackupLabel}</div>
                    <div className="text-[11px] text-slate-300">{ts.sftpAutoBackupDesc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={!!settings.sftpAutoBackup}
                    onChange={(e) => onUpdateSettings({ sftpAutoBackup: e.target.checked })}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-400"
                  />
                </label>

                <div className="flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-[11px] text-emerald-200">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span>{ts.sftpLocalOnlyNote}</span>
                </div>

                {/* Custom Root Backup Directory */}
                <div className="space-y-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                  <div>
                    <div className="font-semibold text-white">{ts.sftpBackupDirLabel}</div>
                    <div className="text-[11px] text-slate-400">{ts.sftpBackupDirDesc}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div
                      dir="ltr"
                      title={backupStats.backupDir}
                      className="min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-slate-950/75 px-3 py-1.5 font-mono text-[11px] text-cyan-200"
                    >
                      {backupStats.backupDir || '...'}
                    </div>
                    <button
                      type="button"
                      onClick={handleChooseBackupDir}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-500/15 px-3 py-1.5 text-[11px] font-semibold text-cyan-200 transition hover:bg-cyan-500/25"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      {ts.sftpChooseFolder}
                    </button>
                    {backupStats.isCustomDir && (
                      <button
                        type="button"
                        onClick={handleResetBackupDir}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-300 transition hover:bg-white/10 hover:text-white"
                      >
                        <RotateCcw className="h-3 w-3" />
                        {ts.sftpResetDefault}
                      </button>
                    )}
                  </div>
                </div>

                {/* Retention: Unlimited toggle + Presets + Custom input */}
                <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                  <label className="flex cursor-pointer items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-white">{ts.sftpKeepAllLabel}</div>
                      <div className="text-[11px] text-slate-400">{ts.sftpKeepAllDesc}</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={keepAll}
                      onChange={(e) => onUpdateSettings({ sftpKeepAllBackups: e.target.checked })}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-400"
                    />
                  </label>

                  <div className={`space-y-2 border-t border-white/10 pt-3 ${keepAll ? 'pointer-events-none opacity-40' : ''}`}>
                    <div>
                      <div className="font-semibold text-white">{ts.sftpMaxBackupsLabel}</div>
                      <div className="text-[11px] text-slate-400">{ts.sftpMaxBackupsDesc}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {MAX_BACKUP_OPTIONS.map((count) => (
                        <button
                          key={count}
                          type="button"
                          onClick={() => {
                            setCustomLimitInput(String(count));
                            onUpdateSettings({ sftpMaxBackups: count });
                          }}
                          className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                            maxBackups === count
                              ? 'border-cyan-400/40 bg-cyan-500/20 text-cyan-200'
                              : 'border-white/10 bg-slate-950/50 text-slate-300 hover:border-white/20 hover:text-white'
                          }`}
                        >
                          {count} {ts.versionsUnit}
                        </button>
                      ))}
                      <div className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-slate-950/70 px-2.5 py-1">
                        <span className="text-[11px] text-slate-400">{ts.sftpCustomCountLabel}</span>
                        <input
                          type="number"
                          min={1}
                          max={1000}
                          value={customLimitInput}
                          onChange={(e) => handleCustomLimitCommit(e.target.value)}
                          onBlur={() => setCustomLimitInput(String(maxBackups))}
                          className="w-14 bg-transparent text-center font-mono text-xs font-semibold text-cyan-200 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Server Reports Export Folder & Format */}
                <div className="space-y-2.5 rounded-xl border border-indigo-400/20 bg-indigo-500/[0.05] p-3.5">
                  <div>
                    <div className="font-semibold text-white">{ts.reportExportDirLabel}</div>
                    <div className="text-[11px] text-slate-400">{ts.reportExportDirDesc}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div
                      dir="ltr"
                      title={reportInfo.exportDir}
                      className="min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-slate-950/75 px-3 py-1.5 font-mono text-[11px] text-indigo-200"
                    >
                      {reportInfo.exportDir || '...'}
                    </div>
                    <button
                      type="button"
                      onClick={handleChooseReportDir}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-400/30 bg-indigo-500/15 px-3 py-1.5 text-[11px] font-semibold text-indigo-200 transition hover:bg-indigo-500/25"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      {ts.sftpChooseFolder}
                    </button>
                    {reportInfo.isCustomDir && (
                      <button
                        type="button"
                        onClick={handleResetReportDir}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-300 transition hover:bg-white/10 hover:text-white"
                      >
                        <RotateCcw className="h-3 w-3" />
                        {ts.sftpResetDefault}
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-[11px] text-slate-400">{ts.reportFormatLabel}</span>
                    {(['md', 'txt'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => onUpdateSettings({ reportExportFormat: fmt })}
                        className={`rounded-lg border px-3 py-1 font-mono text-[11px] font-semibold uppercase transition ${
                          (settings.reportExportFormat || 'md') === fmt
                            ? 'border-indigo-400/50 bg-indigo-500/25 text-white'
                            : 'border-white/10 bg-slate-950/50 text-slate-400 hover:text-white'
                        }`}
                      >
                        .{fmt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Storage & Clear */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                  <div className="flex items-center gap-2.5">
                    <HardDrive className="h-4 w-4 text-slate-400" />
                    <div>
                      <div className="font-semibold text-white">{ts.sftpStorageLabel}</div>
                      <div className="text-[11px] text-slate-400">
                        {backupStats.totalCount} {ts.sftpStorageFiles} · {formatLocalBytes(backupStats.totalBytes)}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={clearing || backupStats.totalCount === 0}
                    onClick={handleClearAllBackups}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[11px] font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {ts.sftpClearBackups}
                  </button>
                </div>
              </>
            )}

            {/* ALERTS & TRAY TAB */}
            {activeTab === 'alerts' && (
              <>
                <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                  <div>
                    <div className="font-semibold text-white">{ts.desktopAlertsLabel}</div>
                    <div className="text-[11px] text-slate-400">{ts.desktopAlertsDesc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.desktopAlerts !== false}
                    onChange={(e) =>
                      onUpdateSettings({ desktopAlerts: e.target.checked, alertPrefsInit: true })
                    }
                    className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-400"
                  />
                </label>

                <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                  <div>
                    <div className="font-semibold text-white">{ts.minimizeToTrayLabel}</div>
                    <div className="text-[11px] text-slate-400">{ts.minimizeToTrayDesc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.minimizeToTray !== false}
                    onChange={(e) =>
                      onUpdateSettings({ minimizeToTray: e.target.checked, alertPrefsInit: true })
                    }
                    className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-400"
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleTestNotification}
                    className="flex-1 rounded-xl border border-cyan-400/30 bg-cyan-500/15 px-3.5 py-2 font-semibold text-cyan-200 transition hover:bg-cyan-500/25"
                  >
                    {ts.testNotification}
                  </button>
                  <button
                    type="button"
                    onClick={() => QuitApp()}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/15 px-3.5 py-2 font-semibold text-rose-200 transition hover:bg-rose-500/25"
                  >
                    <Power className="h-3.5 w-3.5" />
                    {ts.quitApp}
                  </button>
                </div>

                <p className="rounded-xl border border-white/10 bg-slate-950/40 p-3 text-[11px] leading-relaxed text-slate-400">
                  {ts.perServerHint}
                </p>
              </>
            )}

            {/* BACKUP & TRANSFER TAB */}
            {activeTab === 'backup' && (
              <>
                {/* Encrypted export */}
                <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                  <div>
                    <div className="font-semibold text-white">{ts.backupExportTitle}</div>
                    <div className="text-[11px] text-slate-400">{ts.backupExportDesc}</div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      type="password"
                      value={exportPw}
                      onChange={(e) => setExportPw(e.target.value)}
                      placeholder={ts.exportPasswordLabel}
                      disabled={backupBusy !== null}
                      className="w-full rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-400/50 disabled:opacity-50"
                    />
                    <input
                      type="password"
                      value={exportPwConfirm}
                      onChange={(e) => setExportPwConfirm(e.target.value)}
                      placeholder={ts.exportPasswordConfirmLabel}
                      disabled={backupBusy !== null}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleExportInventory();
                      }}
                      className="w-full rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-400/50 disabled:opacity-50"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleExportInventory}
                    disabled={backupBusy !== null}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-500/15 px-3 py-1.5 text-[11px] font-semibold text-cyan-200 transition hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    {backupBusy === 'export' ? '…' : ts.exportBtn}
                  </button>
                </div>

                {/* Encrypted import */}
                <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                  <div>
                    <div className="font-semibold text-white">{ts.importTitle}</div>
                    <div className="text-[11px] text-slate-400">{ts.importDesc}</div>
                  </div>
                  <input
                    type="password"
                    value={importPw}
                    onChange={(e) => setImportPw(e.target.value)}
                    placeholder={ts.importPasswordLabel}
                    disabled={backupBusy !== null}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleImportInventory();
                    }}
                    className="w-full rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-400/50 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={handleImportInventory}
                    disabled={backupBusy !== null}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-1.5 text-[11px] font-semibold text-emerald-200 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    {backupBusy === 'import' ? '…' : ts.importBtn}
                  </button>
                </div>

                {/* Security note */}
                <div className="flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-[11px] text-emerald-200">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span>{ts.backupSecurityNote}</span>
                </div>
              </>
            )}

            {/* ABOUT TAB */}
            {activeTab === 'about' && (
              <div className="space-y-3.5">
                <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.85)]" />
                      <span className="text-base font-extrabold tracking-tight text-white">ZentraDeck</span>
                    </div>
                    <span dir="ltr" className="rounded-full border border-cyan-400/30 bg-cyan-500/15 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-cyan-300">
                      {appVersion}
                    </span>
                  </div>

                  <p className="leading-relaxed text-slate-300">{ts.aboutSummary}</p>

                  <div className="space-y-2 border-t border-white/10 pt-3">
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-950/50 px-3 py-2">
                      <span className="inline-flex items-center gap-1.5 text-slate-400">
                        <User className="h-3.5 w-3.5 text-cyan-400" />
                        {ts.aboutCreatorLabel}
                      </span>
                      <span className="font-semibold text-white">{ts.aboutCreatorValue}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-950/50 px-3 py-2">
                      <span className="inline-flex items-center gap-1.5 text-slate-400">
                        <Cpu className="h-3.5 w-3.5 text-indigo-400" />
                        {ts.aboutStackLabel}
                      </span>
                      <span className="font-medium text-cyan-200">{ts.aboutStackValue}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-950/50 px-3 py-2">
                      <span className="inline-flex items-center gap-1.5 text-slate-400">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                        {ts.aboutPrivacyLabel}
                      </span>
                      <span className="font-medium text-emerald-300">{ts.aboutPrivacyValue}</span>
                    </div>
                  </div>
                </div>

                {/* GitHub Star Highlight Box */}
                <div className="space-y-2.5 rounded-xl border border-amber-400/25 bg-amber-500/[0.07] p-3.5">
                  <p className="text-[11px] leading-relaxed text-amber-100/90">{ts.aboutStarNote}</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => BrowserOpenURL('https://github.com/CyberRhythm/ZentraDeck')}
                      className="flex items-center justify-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/20 px-4 py-2.5 font-bold text-amber-100 transition hover:bg-amber-500/30 hover:text-white"
                    >
                      <Star className="h-4 w-4 fill-amber-300 text-amber-300" />
                      {ts.starOnGithub}
                    </button>
                    <button
                      type="button"
                      onClick={() => BrowserOpenURL('https://github.com/CyberRhythm/ZentraDeck/issues')}
                      className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
                    >
                      <Bug className="h-4 w-4 text-slate-300" />
                      {ts.reportIssue}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSupport();
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/15 px-4 py-2.5 font-semibold text-rose-200 transition hover:bg-rose-500/25 hover:text-white"
                >
                  <Heart className="h-4 w-4 fill-rose-400 text-rose-400" />
                  {ts.openSupport}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}