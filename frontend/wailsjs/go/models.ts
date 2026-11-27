export namespace main {
	
	export class ActionResult {
	    success: boolean;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new ActionResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.message = source["message"];
	    }
	}
	export class AlertRules {
	    configured: boolean;
	    muted: boolean;
	    onOutage: boolean;
	    onFailedSvc: boolean;
	    cpuThreshold: number;
	    ramThreshold: number;
	    diskThreshold: number;
	    cooldownMin: number;
	
	    static createFrom(source: any = {}) {
	        return new AlertRules(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.configured = source["configured"];
	        this.muted = source["muted"];
	        this.onOutage = source["onOutage"];
	        this.onFailedSvc = source["onFailedSvc"];
	        this.cpuThreshold = source["cpuThreshold"];
	        this.ramThreshold = source["ramThreshold"];
	        this.diskThreshold = source["diskThreshold"];
	        this.cooldownMin = source["cooldownMin"];
	    }
	}
	export class AppSettings {
	    language: string;
	    viewMode: string;
	    privacyMode: boolean;
	    pollIntervalSec: number;
	    desktopAlerts: boolean;
	    minimizeToTray: boolean;
	    alertPrefsInit: boolean;
	    sftpAutoBackup: boolean;
	    sftpMaxBackups: number;
	    sftpKeepAllBackups: boolean;
	    sftpBackupDir: string;
	    reportExportDir: string;
	    reportExportFormat: string;
	
	    static createFrom(source: any = {}) {
	        return new AppSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.language = source["language"];
	        this.viewMode = source["viewMode"];
	        this.privacyMode = source["privacyMode"];
	        this.pollIntervalSec = source["pollIntervalSec"];
	        this.desktopAlerts = source["desktopAlerts"];
	        this.minimizeToTray = source["minimizeToTray"];
	        this.alertPrefsInit = source["alertPrefsInit"];
	        this.sftpAutoBackup = source["sftpAutoBackup"];
	        this.sftpMaxBackups = source["sftpMaxBackups"];
	        this.sftpKeepAllBackups = source["sftpKeepAllBackups"];
	        this.sftpBackupDir = source["sftpBackupDir"];
	        this.reportExportDir = source["reportExportDir"];
	        this.reportExportFormat = source["reportExportFormat"];
	    }
	}
	export class BroadcastResult {
	    serverId: string;
	    serverName: string;
	    success: boolean;
	    output: string;
	    error: string;
	    durationMs: number;
	
	    static createFrom(source: any = {}) {
	        return new BroadcastResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.serverId = source["serverId"];
	        this.serverName = source["serverName"];
	        this.success = source["success"];
	        this.output = source["output"];
	        this.error = source["error"];
	        this.durationMs = source["durationMs"];
	    }
	}
	export class CommandOutput {
	    success: boolean;
	    output: string;
	    durationMs: number;
	
	    static createFrom(source: any = {}) {
	        return new CommandOutput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.output = source["output"];
	        this.durationMs = source["durationMs"];
	    }
	}
	export class CommandSnippet {
	    id: string;
	    title: string;
	    command: string;
	    category: string;
	    description: string;
	
	    static createFrom(source: any = {}) {
	        return new CommandSnippet(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.command = source["command"];
	        this.category = source["category"];
	        this.description = source["description"];
	    }
	}
	export class CronJobItem {
	    lineIndex: number;
	    schedule: string;
	    command: string;
	    comment: string;
	    enabled: boolean;
	    source: string;
	
	    static createFrom(source: any = {}) {
	        return new CronJobItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.lineIndex = source["lineIndex"];
	        this.schedule = source["schedule"];
	        this.command = source["command"];
	        this.comment = source["comment"];
	        this.enabled = source["enabled"];
	        this.source = source["source"];
	    }
	}
	export class FileEntry {
	    name: string;
	    path: string;
	    isDir: boolean;
	    isSymlink: boolean;
	    size: number;
	    mode: string;
	    modTime: string;
	
	    static createFrom(source: any = {}) {
	        return new FileEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.isDir = source["isDir"];
	        this.isSymlink = source["isSymlink"];
	        this.size = source["size"];
	        this.mode = source["mode"];
	        this.modTime = source["modTime"];
	    }
	}
	export class DirListResult {
	    success: boolean;
	    path: string;
	    parent: string;
	    entries: FileEntry[];
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new DirListResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.path = source["path"];
	        this.parent = source["parent"];
	        this.entries = this.convertValues(source["entries"], FileEntry);
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DiskMetric {
	    mount: string;
	    totalGB: number;
	    usedGB: number;
	    percent: number;
	
	    static createFrom(source: any = {}) {
	        return new DiskMetric(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.mount = source["mount"];
	        this.totalGB = source["totalGB"];
	        this.usedGB = source["usedGB"];
	        this.percent = source["percent"];
	    }
	}
	export class DockerContainer {
	    id: string;
	    name: string;
	    image: string;
	    state: string;
	    status: string;
	    ports: string;
	
	    static createFrom(source: any = {}) {
	        return new DockerContainer(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.image = source["image"];
	        this.state = source["state"];
	        this.status = source["status"];
	        this.ports = source["ports"];
	    }
	}
	export class FileContentResult {
	    success: boolean;
	    path: string;
	    content: string;
	    size: number;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new FileContentResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.path = source["path"];
	        this.content = source["content"];
	        this.size = source["size"];
	        this.error = source["error"];
	    }
	}
	
	export class HistoryIncident {
	    id: string;
	    timestamp: string;
	    category: string;
	    severity: string;
	    service: string;
	    summary: string;
	    rawLog: string;
	
	    static createFrom(source: any = {}) {
	        return new HistoryIncident(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.timestamp = source["timestamp"];
	        this.category = source["category"];
	        this.severity = source["severity"];
	        this.service = source["service"];
	        this.summary = source["summary"];
	        this.rawLog = source["rawLog"];
	    }
	}
	export class HistoryInsight {
	    code: string;
	    severity: string;
	    metric: string;
	    detail: string;
	
	    static createFrom(source: any = {}) {
	        return new HistoryInsight(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.code = source["code"];
	        this.severity = source["severity"];
	        this.metric = source["metric"];
	        this.detail = source["detail"];
	    }
	}
	export class HistoryPeak {
	    value: number;
	    timestamp: string;
	
	    static createFrom(source: any = {}) {
	        return new HistoryPeak(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.value = source["value"];
	        this.timestamp = source["timestamp"];
	    }
	}
	export class HistoryPoint {
	    timestamp: string;
	    fullTime: string;
	    cpuUser: number;
	    cpuSystem: number;
	    cpuIOWait: number;
	    cpuSteal: number;
	    cpuTotal: number;
	    ramPercent: number;
	    swapPercent: number;
	    load1: number;
	    load5: number;
	    netRxKBps: number;
	    netTxKBps: number;
	
	    static createFrom(source: any = {}) {
	        return new HistoryPoint(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.timestamp = source["timestamp"];
	        this.fullTime = source["fullTime"];
	        this.cpuUser = source["cpuUser"];
	        this.cpuSystem = source["cpuSystem"];
	        this.cpuIOWait = source["cpuIOWait"];
	        this.cpuSteal = source["cpuSteal"];
	        this.cpuTotal = source["cpuTotal"];
	        this.ramPercent = source["ramPercent"];
	        this.swapPercent = source["swapPercent"];
	        this.load1 = source["load1"];
	        this.load5 = source["load5"];
	        this.netRxKBps = source["netRxKBps"];
	        this.netTxKBps = source["netTxKBps"];
	    }
	}
	export class HistorySummary {
	    avgCpu: number;
	    peakCpu: HistoryPeak;
	    avgRam: number;
	    peakRam: HistoryPeak;
	    peakIOWait: HistoryPeak;
	    peakSteal: HistoryPeak;
	    peakLoad: HistoryPeak;
	    peakNetRx: HistoryPeak;
	    peakNetTx: HistoryPeak;
	    peakSwap: HistoryPeak;
	    avgIOWait: number;
	    avgSteal: number;
	    avgLoad: number;
	    stabilityScore: number;
	    sampleCount: number;
	    dataSpan: string;
	
	    static createFrom(source: any = {}) {
	        return new HistorySummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.avgCpu = source["avgCpu"];
	        this.peakCpu = this.convertValues(source["peakCpu"], HistoryPeak);
	        this.avgRam = source["avgRam"];
	        this.peakRam = this.convertValues(source["peakRam"], HistoryPeak);
	        this.peakIOWait = this.convertValues(source["peakIOWait"], HistoryPeak);
	        this.peakSteal = this.convertValues(source["peakSteal"], HistoryPeak);
	        this.peakLoad = this.convertValues(source["peakLoad"], HistoryPeak);
	        this.peakNetRx = this.convertValues(source["peakNetRx"], HistoryPeak);
	        this.peakNetTx = this.convertValues(source["peakNetTx"], HistoryPeak);
	        this.peakSwap = this.convertValues(source["peakSwap"], HistoryPeak);
	        this.avgIOWait = source["avgIOWait"];
	        this.avgSteal = source["avgSteal"];
	        this.avgLoad = source["avgLoad"];
	        this.stabilityScore = source["stabilityScore"];
	        this.sampleCount = source["sampleCount"];
	        this.dataSpan = source["dataSpan"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ImportSummary {
	    added: number;
	    updated: number;
	    cancelled: boolean;

	    static createFrom(source: any = {}) {
	        return new ImportSummary(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.added = source["added"];
	        this.updated = source["updated"];
	        this.cancelled = source["cancelled"];
	    }
	}
	export class OpenPort {
	    proto: string;
	    address: string;
	    port: string;
	    process: string;
	
	    static createFrom(source: any = {}) {
	        return new OpenPort(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.proto = source["proto"];
	        this.address = source["address"];
	        this.port = source["port"];
	        this.process = source["process"];
	    }
	}
	export class PTYStartResult {
	    success: boolean;
	    sessionId: string;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new PTYStartResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.sessionId = source["sessionId"];
	        this.error = source["error"];
	    }
	}
	export class ProcessInfo {
	    pid: number;
	    user: string;
	    cpu: number;
	    mem: number;
	    command: string;
	
	    static createFrom(source: any = {}) {
	        return new ProcessInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.pid = source["pid"];
	        this.user = source["user"];
	        this.cpu = source["cpu"];
	        this.mem = source["mem"];
	        this.command = source["command"];
	    }
	}
	export class ReportExportInfo {
	    exportDir: string;
	    isCustomDir: boolean;
	    format: string;
	
	    static createFrom(source: any = {}) {
	        return new ReportExportInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.exportDir = source["exportDir"];
	        this.isCustomDir = source["isCustomDir"];
	        this.format = source["format"];
	    }
	}
	export class SSLCertInfo {
	    domain: string;
	    path: string;
	    expiresAt: string;
	    daysLeft: number;
	    status: string;
	
	    static createFrom(source: any = {}) {
	        return new SSLCertInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.domain = source["domain"];
	        this.path = source["path"];
	        this.expiresAt = source["expiresAt"];
	        this.daysLeft = source["daysLeft"];
	        this.status = source["status"];
	    }
	}
	export class SaveReportResult {
	    success: boolean;
	    filePath: string;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new SaveReportResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.filePath = source["filePath"];
	        this.message = source["message"];
	    }
	}
	export class SystemdTimerItem {
	    unit: string;
	    nextRun: string;
	    lastRun: string;
	    activates: string;
	    active: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SystemdTimerItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.unit = source["unit"];
	        this.nextRun = source["nextRun"];
	        this.lastRun = source["lastRun"];
	        this.activates = source["activates"];
	        this.active = source["active"];
	    }
	}
	export class ScheduledTasksReport {
	    serverId: string;
	    cronJobs: CronJobItem[];
	    timers: SystemdTimerItem[];
	    generatedAt: string;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new ScheduledTasksReport(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.serverId = source["serverId"];
	        this.cronJobs = this.convertValues(source["cronJobs"], CronJobItem);
	        this.timers = this.convertValues(source["timers"], SystemdTimerItem);
	        this.generatedAt = source["generatedAt"];
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SecurityCheckItem {
	    id: string;
	    status: string;
	    points: number;
	    maxPts: number;
	    value: string;
	    fixHint: string;
	
	    static createFrom(source: any = {}) {
	        return new SecurityCheckItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.status = source["status"];
	        this.points = source["points"];
	        this.maxPts = source["maxPts"];
	        this.value = source["value"];
	        this.fixHint = source["fixHint"];
	    }
	}
	export class SecurityAuditReport {
	    serverId: string;
	    score: number;
	    grade: string;
	    checks: SecurityCheckItem[];
	    certs: SSLCertInfo[];
	    generatedAt: string;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new SecurityAuditReport(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.serverId = source["serverId"];
	        this.score = source["score"];
	        this.grade = source["grade"];
	        this.checks = this.convertValues(source["checks"], SecurityCheckItem);
	        this.certs = this.convertValues(source["certs"], SSLCertInfo);
	        this.generatedAt = source["generatedAt"];
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class ServerConfig {
	    id: string;
	    name: string;
	    host: string;
	    port: number;
	    username: string;
	    authType: string;
	    password: string;
	    keyPath: string;
	    privateKey: string;
	    group: string;
	    isDemo: boolean;
	    useProxy: boolean;
	    proxyHost: string;
	    proxyPort: number;
	    proxyUser: string;
	    proxyPass: string;
	    hasPassword: boolean;
	    hasPrivateKey: boolean;
	    hasProxyPass: boolean;
	    alertRules: AlertRules;
	
	    static createFrom(source: any = {}) {
	        return new ServerConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.username = source["username"];
	        this.authType = source["authType"];
	        this.password = source["password"];
	        this.keyPath = source["keyPath"];
	        this.privateKey = source["privateKey"];
	        this.group = source["group"];
	        this.isDemo = source["isDemo"];
	        this.useProxy = source["useProxy"];
	        this.proxyHost = source["proxyHost"];
	        this.proxyPort = source["proxyPort"];
	        this.proxyUser = source["proxyUser"];
	        this.proxyPass = source["proxyPass"];
	        this.hasPassword = source["hasPassword"];
	        this.hasPrivateKey = source["hasPrivateKey"];
	        this.hasProxyPass = source["hasProxyPass"];
	        this.alertRules = this.convertValues(source["alertRules"], AlertRules);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ServerHistoryReport {
	    serverId: string;
	    range: string;
	    sysstatInstalled: boolean;
	    sysstatActive: boolean;
	    sysstatDir: string;
	    availableDays: number;
	    intervalHint: string;
	    points: HistoryPoint[];
	    summary: HistorySummary;
	    incidents: HistoryIncident[];
	    insights: HistoryInsight[];
	    generatedAt: string;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new ServerHistoryReport(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.serverId = source["serverId"];
	        this.range = source["range"];
	        this.sysstatInstalled = source["sysstatInstalled"];
	        this.sysstatActive = source["sysstatActive"];
	        this.sysstatDir = source["sysstatDir"];
	        this.availableDays = source["availableDays"];
	        this.intervalHint = source["intervalHint"];
	        this.points = this.convertValues(source["points"], HistoryPoint);
	        this.summary = this.convertValues(source["summary"], HistorySummary);
	        this.incidents = this.convertValues(source["incidents"], HistoryIncident);
	        this.insights = this.convertValues(source["insights"], HistoryInsight);
	        this.generatedAt = source["generatedAt"];
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ServiceInfo {
	    name: string;
	    status: string;
	    subState: string;
	    description: string;
	
	    static createFrom(source: any = {}) {
	        return new ServiceInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.status = source["status"];
	        this.subState = source["subState"];
	        this.description = source["description"];
	    }
	}
	export class ServerMetrics {
	    serverId: string;
	    online: boolean;
	    error: string;
	    timestamp: string;
	    latencyMs: number;
	    hostname: string;
	    os: string;
	    kernel: string;
	    uptime: string;
	    cpuPercent: number;
	    cpuCores: number;
	    load1: number;
	    load5: number;
	    load15: number;
	    ramTotalGB: number;
	    ramUsedGB: number;
	    ramPercent: number;
	    swapTotalGB: number;
	    swapUsedGB: number;
	    swapPercent: number;
	    netRxKBps: number;
	    netTxKBps: number;
	    diskPercent: number;
	    diskUsedGB: number;
	    diskTotalGB: number;
	    disks: DiskMetric[];
	    services: ServiceInfo[];
	    processes: ProcessInfo[];
	    dockerAvailable: boolean;
	    containers: DockerContainer[];
	    openPorts: OpenPort[];
	    firewallStatus: string;
	    healthScore: number;
	    healthIssues: string[];
	    failedServices: number;
	
	    static createFrom(source: any = {}) {
	        return new ServerMetrics(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.serverId = source["serverId"];
	        this.online = source["online"];
	        this.error = source["error"];
	        this.timestamp = source["timestamp"];
	        this.latencyMs = source["latencyMs"];
	        this.hostname = source["hostname"];
	        this.os = source["os"];
	        this.kernel = source["kernel"];
	        this.uptime = source["uptime"];
	        this.cpuPercent = source["cpuPercent"];
	        this.cpuCores = source["cpuCores"];
	        this.load1 = source["load1"];
	        this.load5 = source["load5"];
	        this.load15 = source["load15"];
	        this.ramTotalGB = source["ramTotalGB"];
	        this.ramUsedGB = source["ramUsedGB"];
	        this.ramPercent = source["ramPercent"];
	        this.swapTotalGB = source["swapTotalGB"];
	        this.swapUsedGB = source["swapUsedGB"];
	        this.swapPercent = source["swapPercent"];
	        this.netRxKBps = source["netRxKBps"];
	        this.netTxKBps = source["netTxKBps"];
	        this.diskPercent = source["diskPercent"];
	        this.diskUsedGB = source["diskUsedGB"];
	        this.diskTotalGB = source["diskTotalGB"];
	        this.disks = this.convertValues(source["disks"], DiskMetric);
	        this.services = this.convertValues(source["services"], ServiceInfo);
	        this.processes = this.convertValues(source["processes"], ProcessInfo);
	        this.dockerAvailable = source["dockerAvailable"];
	        this.containers = this.convertValues(source["containers"], DockerContainer);
	        this.openPorts = this.convertValues(source["openPorts"], OpenPort);
	        this.firewallStatus = source["firewallStatus"];
	        this.healthScore = source["healthScore"];
	        this.healthIssues = source["healthIssues"];
	        this.failedServices = source["failedServices"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class SftpBackupItem {
	    id: string;
	    filePath: string;
	    fileName: string;
	    createdAt: string;
	    size: number;
	
	    static createFrom(source: any = {}) {
	        return new SftpBackupItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.filePath = source["filePath"];
	        this.fileName = source["fileName"];
	        this.createdAt = source["createdAt"];
	        this.size = source["size"];
	    }
	}
	export class SftpBackupStats {
	    totalCount: number;
	    totalBytes: number;
	    backupDir: string;
	    isCustomDir: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SftpBackupStats(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.totalCount = source["totalCount"];
	        this.totalBytes = source["totalBytes"];
	        this.backupDir = source["backupDir"];
	        this.isCustomDir = source["isCustomDir"];
	    }
	}
	export class SftpRestoreResult {
	    success: boolean;
	    message: string;
	    content: string;
	
	    static createFrom(source: any = {}) {
	        return new SftpRestoreResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.message = source["message"];
	        this.content = source["content"];
	    }
	}
	export class SysstatPreflightResult {
	    safe: boolean;
	    distro: string;
	    pkgManager: string;
	    alreadyInstalled: boolean;
	    hasSystemd: boolean;
	    freeLogMB: number;
	    hasSudo: boolean;
	    otherCollectors: string[];
	    warnings: string[];
	    exactCommand: string;
	
	    static createFrom(source: any = {}) {
	        return new SysstatPreflightResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.safe = source["safe"];
	        this.distro = source["distro"];
	        this.pkgManager = source["pkgManager"];
	        this.alreadyInstalled = source["alreadyInstalled"];
	        this.hasSystemd = source["hasSystemd"];
	        this.freeLogMB = source["freeLogMB"];
	        this.hasSudo = source["hasSudo"];
	        this.otherCollectors = source["otherCollectors"];
	        this.warnings = source["warnings"];
	        this.exactCommand = source["exactCommand"];
	    }
	}
	
	export class TriggeredAlert {
	    id: string;
	    serverId: string;
	    serverName: string;
	    type: string;
	    detail: string;
	    time: string;
	
	    static createFrom(source: any = {}) {
	        return new TriggeredAlert(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.serverId = source["serverId"];
	        this.serverName = source["serverName"];
	        this.type = source["type"];
	        this.detail = source["detail"];
	        this.time = source["time"];
	    }
	}

}

