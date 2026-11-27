import React, { useState } from 'react';
import {
  ArrowRightCircle,
  BellRing,
  CheckCircle2,
  Clock,
  Download,
  FileCheck2,
  FileText,
  History,
  Loader2,
  Mail,
  PenTool,
  PlayCircle,
  ShieldCheck,
  UserCheck,
  Users
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import {
  cn,
  formatAuditTimestamp,
  formatDateTime,
  formatIsoDateOnly,
  normalizeSyMetricText
} from '../lib/utils';
import {
  EnrichedAuditLog,
  formatActorInline,
  formatDetailEntries,
  LifecycleReportSummary,
  LifecycleStage,
  LifecycleTimelineEvent
} from '../utils/auditLifecycle';
import { generateFinalAuditReportPdf } from '../utils/finalAuditReportPdf';
import { sanitizeReportBrandName } from '../utils/pdfBranding';

interface AuditLifecyclePanelProps {
  summary: LifecycleReportSummary;
  compact?: boolean;
  onExportCsv?: () => void;
  title?: string;
}

const getStageBadgeClass = (stage: LifecycleStage) => {
  switch (stage) {
    case 'Initiation':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'In Progress':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    case 'Review / Signature':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'Closing':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'Post-Closure':
      return 'bg-purple-50 text-purple-700 border-purple-200';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
};

const getStageDotClass = (stage: LifecycleStage) => {
  switch (stage) {
    case 'Initiation':
      return 'bg-blue-600 text-white';
    case 'In Progress':
      return 'bg-indigo-600 text-white';
    case 'Review / Signature':
      return 'bg-amber-500 text-white';
    case 'Closing':
      return 'bg-emerald-600 text-white';
    case 'Post-Closure':
      return 'bg-purple-600 text-white';
    default:
      return 'bg-slate-600 text-white';
  }
};

const StageIcon = ({ stage }: { stage: LifecycleStage }) => {
  switch (stage) {
    case 'Initiation':
      return <PlayCircle className="w-3.5 h-3.5" />;
    case 'In Progress':
      return <Clock className="w-3.5 h-3.5" />;
    case 'Review / Signature':
      return <FileCheck2 className="w-3.5 h-3.5" />;
    case 'Closing':
      return <CheckCircle2 className="w-3.5 h-3.5" />;
    case 'Post-Closure':
      return <ShieldCheck className="w-3.5 h-3.5" />;
    default:
      return <History className="w-3.5 h-3.5" />;
  }
};

export function exportLifecycleCsv(summary: LifecycleReportSummary, filenamePrefix: string) {
  const headers = [
    'Step #',
    'Stage',
    'Timestamp',
    'When (Timing / Context)',
    'Action',
    'Why Action Was Performed',
    'Initiated By',
    'Performed By (Name)',
    'Performed By Employee ID',
    'Performed By Email ID',
    'Performed By Role',
    'All Involved in Activity',
    'Notified When Finished',
    'Who Gets Next After Finish',
    'Summary',
    'Field Changes',
    'All Details'
  ];

  const rows = summary.events.map((ev, idx) => [
    String(idx + 1).padStart(2, '0'),
    ev.stage,
    ev.timestamp ? formatAuditTimestamp(ev.timestamp) : '-',
    ev.when || '-',
    normalizeSyMetricText(ev.action),
    normalizeSyMetricText(ev.why || '-'),
    normalizeSyMetricText(ev.initiatedBy ? formatActorInline(ev.initiatedBy) : formatActorInline(summary.initiatedBy)),
    normalizeSyMetricText(ev.actor.name),
    ev.actor.employeeId || '—',
    ev.actor.email || '—',
    ev.actor.role || '-',
    ev.involvedParties
      .map((p) => `${p.roleInActivity}: ${p.name}${p.employeeId ? ` [${p.employeeId}]` : ''}${p.email ? ` (${p.email})` : ''}`)
      .join(' | '),
    ev.notifiedOnFinish.join(' | ') || '-',
    ev.nextAfterFinish || '-',
    normalizeSyMetricText(ev.summary),
    (ev.changes || []).map((c) => `${c.field}: ${c.from ?? '-'} -> ${c.to ?? '-'}`).join('; '),
    formatDetailEntries(ev.details)
      .map((d) => `${d.label}: ${d.value}`)
      .join(' | ')
  ]);

  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filenamePrefix}_${summary.entityId}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const SingleActivityDetailCard: React.FC<{ log: EnrichedAuditLog }> = ({ log }) => {
  const detailPairs = formatDetailEntries(log.details);

  return (
    <div className="bg-card border rounded-2xl p-5 space-y-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase', getStageBadgeClass(log.stage))}>
              {log.stage}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold uppercase">
              {log.resolvedEntityType.replace(/_/g, ' ')}
            </span>
            <h4 className="text-base font-bold text-foreground">{log.action}</h4>
          </div>
          <p className="text-xs text-muted-foreground">
            Module: <span className="font-semibold text-foreground">{log.module}</span>
            {log.entityTitle ? ` • ${log.entityTitle}` : ''}
            {log.entityId ? ` • ID: ${log.entityId}` : ''}
          </p>
        </div>
        <span className="text-xs font-mono text-muted-foreground">{formatDateTime(log.timestamp)}</span>
      </div>

      {/* 5 Ws Audit Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 p-3 rounded-xl border bg-muted/25 text-xs">
        <div>
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Date &amp; Time</p>
          <p className="font-mono font-semibold text-foreground">{formatDateTime(log.timestamp)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Who Performed</p>
          <p className="font-semibold text-foreground">{formatActorInline(log.actor)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase text-muted-foreground">When</p>
          <p className="font-medium text-foreground">{log.when || log.stage}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase text-muted-foreground">What Action</p>
          <p className="font-semibold text-foreground">{log.action}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Why</p>
          <p className="font-medium text-foreground">{log.why || 'Audit compliance record'}</p>
        </div>
      </div>

      {/* Initiated By & Performed By */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-3 rounded-xl border bg-muted/20 space-y-1">
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Performed By (This Activity)</p>
          <p className="text-sm font-bold text-foreground">{log.actor.name}</p>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {log.actor.employeeId && (
              <span className="px-1.5 py-0.5 rounded bg-background border font-mono font-bold text-primary">
                EMP: {log.actor.employeeId}
              </span>
            )}
            {log.actor.role && (
              <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">{log.actor.role}</span>
            )}
          </div>
          {log.actor.email && <p className="text-[11px] font-mono text-muted-foreground">{log.actor.email}</p>}
        </div>

        <div className="p-3 rounded-xl border bg-blue-50/40 space-y-1">
          <p className="text-[10px] font-bold uppercase text-blue-700">Workflow Initiated By</p>
          {log.initiatedBy ? (
            <>
              <p className="text-sm font-bold text-foreground">{log.initiatedBy.name}</p>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                {log.initiatedBy.employeeId && (
                  <span className="px-1.5 py-0.5 rounded bg-background border font-mono font-bold text-primary">
                    EMP: {log.initiatedBy.employeeId}
                  </span>
                )}
                {log.initiatedBy.role && (
                  <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">
                    {log.initiatedBy.role}
                  </span>
                )}
              </div>
              {log.initiatedBy.email && (
                <p className="text-[11px] font-mono text-muted-foreground">{log.initiatedBy.email}</p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{formatActorInline(log.actor)}</p>
          )}
        </div>
      </div>

      {/* All Involved in This Activity */}
      <div className="p-3 rounded-xl border bg-background space-y-2">
        <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-primary" />
          <span>All People Involved in This Activity ({log.involvedParties.length})</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {log.involvedParties.map((p, idx) => (
            <div key={idx} className="px-2.5 py-1 rounded-lg border bg-muted/30 text-[11px]">
              <span className="font-bold text-primary">{p.roleInActivity}:</span>{' '}
              <span className="font-semibold text-foreground">{p.name}</span>
              {p.employeeId && <span className="font-mono text-muted-foreground"> [{p.employeeId}]</span>}
              {p.email && <span className="font-mono text-muted-foreground"> ({p.email})</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Notified When Finished & Who Gets Next */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-3 rounded-xl border bg-amber-50/40 space-y-1.5">
          <p className="text-[10px] font-bold uppercase text-amber-800 flex items-center gap-1.5">
            <BellRing className="w-3.5 h-3.5" />
            <span>Notified When Finished</span>
          </p>
          {log.notifiedOnFinish.length > 0 ? (
            <ul className="space-y-1 text-xs text-foreground">
              {log.notifiedOnFinish.map((n, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-amber-700 font-bold">•</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">No external notification triggered at this step.</p>
          )}
        </div>

        <div className="p-3 rounded-xl border bg-emerald-50/40 space-y-1.5">
          <p className="text-[10px] font-bold uppercase text-emerald-700 flex items-center gap-1.5">
            <ArrowRightCircle className="w-3.5 h-3.5" />
            <span>After Finish &rarr; Who Gets Next</span>
          </p>
          <p className="text-xs font-semibold text-foreground">
            {log.nextAfterFinish || 'No further workflow handoff required.'}
          </p>
        </div>
      </div>

      {/* Field Changes */}
      {Array.isArray(log.changes) && log.changes.length > 0 && (
        <div className="bg-muted/40 p-3 rounded-xl border space-y-1 text-xs">
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Field Changes</p>
          {log.changes.map((c, idx) => (
            <div key={idx} className="flex flex-wrap gap-1.5 font-mono">
              <span className="font-bold text-foreground">{c.field}:</span>
              <span className="text-rose-600 line-through">{String(c.from ?? '—')}</span>
              <span>&rarr;</span>
              <span className="text-emerald-700 font-semibold">{String(c.to ?? '—')}</span>
            </div>
          ))}
        </div>
      )}

      {/* Additional Metadata */}
      {detailPairs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2 border-t text-xs">
          {detailPairs.map((pair, idx) => (
            <div key={idx}>
              <p className="text-[10px] font-bold uppercase text-muted-foreground">{pair.label}</p>
              <p className="text-foreground font-medium break-words">{pair.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const HistoryActionIcon: React.FC<{ stage: LifecycleStage; action: string }> = ({ stage, action }) => {
  const act = action.toLowerCase();
  if (stage === 'Closing' || act.includes('completed') || act.includes('closed')) {
    return <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />;
  }
  if (stage === 'Review / Signature' || act.includes('signed')) {
    return <PenTool className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />;
  }
  if (act.includes('email') || act.includes('assigned') || act.includes('started signing') || act.includes('notif')) {
    return <Mail className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />;
  }
  if (stage === 'In Progress' && act.includes('opened')) {
    return <FileText className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />;
  }
  return <FileText className="w-4 h-4 text-orange-700 shrink-0 mt-0.5" />;
};

export const AuditLifecyclePanel: React.FC<AuditLifecyclePanelProps> = ({
  summary,
  compact = false,
  onExportCsv,
  title
}) => {
  const { branding } = useAuth();
  const [viewMode, setViewMode] = useState<'final_report' | 'lifecycle_trace'>('final_report');
  const [exportingPdf, setExportingPdf] = useState(false);

  const cleanReportTitle =
    normalizeSyMetricText(sanitizeReportBrandName(summary.entityTitle)) || 'Audit Report';
  const initiatorLine = [
    normalizeSyMetricText(summary.initiatedBy.name),
    summary.initiatedBy.employeeId ? `[${summary.initiatedBy.employeeId}]` : '',
    summary.initiatedBy.email ? `(${summary.initiatedBy.email})` : ''
  ]
    .filter(Boolean)
    .join(' ');
  const createdDateStr = formatIsoDateOnly(
    summary.initiatedBy.timestamp || summary.events[0]?.timestamp
  );
  const generatedDateStr = formatIsoDateOnly(new Date());

  const handleDownloadPdf = async () => {
    setExportingPdf(true);
    try {
      await generateFinalAuditReportPdf(summary, branding);
      toast.success('Final Audit Report PDF downloaded');
    } catch (err) {
      console.error('Failed to generate Final Audit Report PDF:', err);
      toast.error('Failed to generate Final Audit Report PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Lifecycle Summary Overview */}
      <div className="bg-card border rounded-2xl shadow-sm p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-foreground">
                  {title || 'End-to-End Activity & Audit Lifecycle'}
                </h3>
                <span
                  className={cn(
                    'px-2 py-0.5 rounded text-[11px] font-semibold border',
                    summary.isClosed
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  )}
                >
                  {summary.currentStatus}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {cleanReportTitle} • Transaction ID: <span className="font-mono tabular-nums">{summary.entityId}</span> • {summary.events.length} tracked steps
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('final_report')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0',
                  viewMode === 'final_report'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Final Audit Report
              </button>
              <button
                type="button"
                onClick={() => setViewMode('lifecycle_trace')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0',
                  viewMode === 'lifecycle_trace'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Full Lifecycle Trace
              </button>
            </div>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={exportingPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 text-white rounded-lg text-xs font-semibold hover:bg-sky-700 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              {exportingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              <span>Final Audit Report PDF</span>
            </button>
            <button
              type="button"
              onClick={onExportCsv || (() => exportLifecycleCsv(summary, 'lifecycle_audit'))}
              className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-semibold hover:bg-accent transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'final_report' ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-5">
              <div className="space-y-1.5">
                <h2 className="text-2xl font-normal text-sky-600 leading-snug">
                  {cleanReportTitle}
                </h2>
                <div className="flex items-center justify-between text-xs text-slate-900">
                  <span className="font-medium">Final Audit Report</span>
                  <span className="font-mono tabular-nums">{generatedDateStr}</span>
                </div>
              </div>

              <div className="bg-slate-100 border border-slate-700/80 px-4 py-3 text-xs">
                <dl className="grid grid-cols-[120px_1fr] gap-y-2 gap-x-4">
                  <dt className="text-slate-700 font-medium">Created:</dt>
                  <dd className="text-slate-900 font-mono tabular-nums">{createdDateStr}</dd>

                  <dt className="text-slate-700 font-medium">By:</dt>
                  <dd className="text-slate-900">{initiatorLine}</dd>

                  <dt className="text-slate-700 font-medium">Status:</dt>
                  <dd className="text-slate-900 font-medium">{summary.currentStatus}</dd>

                  <dt className="text-slate-700 font-medium">Transaction ID:</dt>
                  <dd className="text-slate-900 font-mono tabular-nums break-all">{summary.entityId}</dd>
                </dl>
              </div>

              {/* "<Report Title>" History */}
              <div className="space-y-4 pt-2">
                <h3 className="text-lg font-normal text-slate-900">
                  &ldquo;{cleanReportTitle}&rdquo; History
                </h3>

                {summary.events.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 border rounded-lg px-4 bg-slate-50">
                    No activity history recorded yet.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {summary.events.map((ev, idx) => (
                      <div key={ev.id || idx} className="flex items-start gap-3">
                        <HistoryActionIcon stage={ev.stage} action={ev.action} />
                        <div className="space-y-0.5 text-xs">
                          <p className="text-slate-900 leading-snug">
                            <span className="font-mono tabular-nums font-semibold text-slate-500 mr-1.5">
                              Step {String(idx + 1).padStart(2, '0')}
                            </span>
                            <span className="font-semibold text-slate-800 mr-1.5">[{ev.stage}]</span>
                            <span className="font-medium text-slate-900">{normalizeSyMetricText(ev.action)}</span>
                            <span className="text-slate-700">
                              {' '}— Performed by{' '}
                              <span className="font-semibold text-slate-900">{normalizeSyMetricText(ev.actor.name)}</span>
                              {ev.actor.employeeId ? (
                                <span className="font-mono tabular-nums text-slate-700"> [EMP ID: {ev.actor.employeeId}]</span>
                              ) : null}
                              {ev.actor.email ? (
                                <span className="font-mono text-slate-600"> ({ev.actor.email})</span>
                              ) : null}
                            </span>
                          </p>
                          <p className="text-[11px] font-mono tabular-nums text-slate-600">
                            {ev.timestamp ? formatAuditTimestamp(ev.timestamp) : 'Timestamp unavailable'}
                            {ev.why ? ` — ${normalizeSyMetricText(ev.why)}` : ''}
                          </p>
                          {Array.isArray(ev.changes) && ev.changes.length > 0 && (
                            <div className="pt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-mono text-slate-700">
                              {ev.changes.map((c, cIdx) => (
                                <span key={cIdx}>
                                  <span className="font-semibold text-slate-800">{c.field}:</span>{' '}
                                  <span className="text-rose-700 line-through">{String(c.from ?? '—')}</span>{' '}
                                  &rarr;{' '}
                                  <span className="text-emerald-700 font-semibold">{String(c.to ?? '—')}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Structured Audit Steps Table: Steps, Stage, Timestamp, Action & Changes, Performed By Employee ID, Performed By Email ID */}
              <div className="pt-4 border-t border-slate-200 space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Audit Trail Breakdown (Steps, Stage, Timestamp, Action &amp; Changes, Performed By Employee ID &amp; Email ID)
                </h4>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[11px]">
                      <tr>
                        <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Steps</th>
                        <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Stage</th>
                        <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Timestamp</th>
                        <th className="px-3 py-2.5 font-semibold">Action &amp; Tracked Changes</th>
                        <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Performed By</th>
                        <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Performed By Employee ID</th>
                        <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Performed By Email ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {summary.events.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                            No steps recorded yet.
                          </td>
                        </tr>
                      ) : (
                        summary.events.map((ev, idx) => (
                          <tr key={ev.id || idx} className="hover:bg-slate-50/80 transition-colors align-top">
                            <td className="px-3 py-2.5 font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                              {String(idx + 1).padStart(2, '0')}
                            </td>
                            <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">
                              {ev.stage}
                            </td>
                            <td className="px-3 py-2.5 font-mono tabular-nums text-[11px] text-slate-700 whitespace-nowrap">
                              {ev.timestamp ? formatAuditTimestamp(ev.timestamp) : 'N/A'}
                            </td>
                            <td className="px-3 py-2.5 text-slate-900 space-y-1">
                              <p className="font-medium">{normalizeSyMetricText(ev.action)}</p>
                              {ev.when && (
                                <p className="text-[11px] text-slate-500">{normalizeSyMetricText(ev.when)}</p>
                              )}
                              {Array.isArray(ev.changes) && ev.changes.length > 0 && (
                                <div className="pt-0.5 space-y-0.5 font-mono text-[11px] text-slate-700 border-t border-slate-100">
                                  {ev.changes.map((c, cIdx) => (
                                    <div key={cIdx}>
                                      <span className="font-semibold text-slate-800">{c.field}:</span>{' '}
                                      <span className="text-rose-700 line-through">{String(c.from ?? '—')}</span>{' '}
                                      &rarr;{' '}
                                      <span className="text-emerald-700 font-semibold">{String(c.to ?? '—')}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-slate-900 whitespace-nowrap">
                              {normalizeSyMetricText(ev.actor.name)}
                            </td>
                            <td className="px-3 py-2.5 font-mono tabular-nums text-slate-800 whitespace-nowrap">
                              {ev.actor.employeeId || '—'}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                              {ev.actor.email || '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
        </div>
      ) : (
        <React.Fragment>
          <div className="bg-card border rounded-2xl shadow-sm p-5 space-y-4">

        {/* Key Ownership Cards: Initiated By -> Assigned Owner / Candidate -> Closed By */}
        <div className={cn('grid gap-3', compact ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-3')}>
          <div className="p-3.5 rounded-xl border bg-blue-50/40 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Initiated By</p>
            <p className="text-sm font-bold text-foreground">{summary.initiatedBy.name}</p>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              {summary.initiatedBy.employeeId && (
                <span className="px-1.5 py-0.5 rounded bg-background border font-mono font-semibold text-foreground">
                  ID: {summary.initiatedBy.employeeId}
                </span>
              )}
              {summary.initiatedBy.role && (
                <span className="px-1.5 py-0.5 rounded bg-blue-100/70 text-blue-800 font-semibold">
                  {summary.initiatedBy.role}
                </span>
              )}
            </div>
            {summary.initiatedBy.email && (
              <p className="text-[11px] font-mono text-muted-foreground truncate">{summary.initiatedBy.email}</p>
            )}
            <p className="text-[11px] text-muted-foreground pt-0.5">
              Initiated: {summary.initiatedBy.timestamp ? formatDateTime(summary.initiatedBy.timestamp) : 'N/A'}
            </p>
          </div>

          <div className="p-3.5 rounded-xl border bg-muted/20 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {summary.participant ? 'Candidate & Assigned Assessor' : 'Designated Owner / Trainer'}
            </p>
            {summary.participant && (
              <div className="pb-1 border-b border-dashed">
                <p className="text-xs font-bold text-foreground">
                  Trainee: {summary.participant.name}
                  {summary.participant.employeeId ? ` (${summary.participant.employeeId})` : ''}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {summary.participant.email || '—'}
                  {summary.participant.department ? ` • ${summary.participant.department}` : ''}
                </p>
              </div>
            )}
            {summary.assignedOwner ? (
              <div>
                <p className="text-xs font-bold text-foreground flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span>{summary.assignedOwner.name}</span>
                  {summary.assignedOwner.employeeId && (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      ({summary.assignedOwner.employeeId})
                    </span>
                  )}
                </p>
                {summary.assignedOwner.email && (
                  <p className="text-[11px] font-mono text-muted-foreground truncate">{summary.assignedOwner.email}</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Not assigned</p>
            )}
          </div>

          <div
            className={cn(
              'p-3.5 rounded-xl border space-y-1',
              summary.closedBy ? 'bg-emerald-50/40' : 'bg-amber-50/40'
            )}
          >
            <p
              className={cn(
                'text-[10px] font-bold uppercase tracking-wider',
                summary.closedBy ? 'text-emerald-700' : 'text-amber-800'
              )}
            >
              Closing / Completion
            </p>
            {summary.closedBy ? (
              <>
                <p className="text-sm font-bold text-foreground">{summary.closedBy.name}</p>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  {summary.closedBy.employeeId && (
                    <span className="px-1.5 py-0.5 rounded bg-background border font-mono font-semibold text-foreground">
                      ID: {summary.closedBy.employeeId}
                    </span>
                  )}
                  {summary.closedBy.role && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                      {summary.closedBy.role}
                    </span>
                  )}
                </div>
                {summary.closedBy.email && (
                  <p className="text-[11px] font-mono text-muted-foreground truncate">{summary.closedBy.email}</p>
                )}
                <p className="text-[11px] text-muted-foreground pt-0.5">
                  Closed: {summary.closedBy.timestamp ? formatDateTime(summary.closedBy.timestamp) : 'Completed'}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-amber-900">Pending Final Closure</p>
                <p className="text-xs text-amber-800/80">{summary.currentStatus}</p>
              </>
            )}
          </div>
        </div>

        {/* All Involved Parties + Notifications & Next Handoff */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="p-3.5 rounded-xl border bg-background space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-primary" />
              <span>All People Involved ({summary.allInvolvedParties.length})</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {summary.allInvolvedParties.map((p, idx) => (
                <div key={idx} className="px-2 py-1 rounded-lg border bg-muted/25 text-[11px]">
                  <span className="font-bold text-primary">{p.roleInActivity}:</span>{' '}
                  <span className="font-semibold text-foreground">{p.name}</span>
                  {p.employeeId && <span className="font-mono text-muted-foreground"> [{p.employeeId}]</span>}
                  {p.email && <span className="font-mono text-muted-foreground"> ({p.email})</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="p-3.5 rounded-xl border bg-background space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <BellRing className="w-3.5 h-3.5 text-amber-600" />
              <span>Notified Recipients &amp; Next Handoff</span>
            </p>
            {summary.notificationsSummary.length > 0 && (
              <div className="space-y-0.5 text-[11px]">
                <p className="font-bold text-amber-800">Notified Upon Completion / Latest Step:</p>
                {summary.notificationsSummary.map((n, idx) => (
                  <p key={idx} className="text-foreground">• {n}</p>
                ))}
              </div>
            )}
            <div className="pt-1 border-t border-dashed text-[11px]">
              <span className="font-bold text-emerald-700">Who Gets Next: </span>
              <span className="font-semibold text-foreground">{summary.nextStepSummary}</span>
            </div>
          </div>
        </div>

        {/* Summary Metrics Strip */}
        {summary.metrics && summary.metrics.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1">
            {summary.metrics.map((m, idx) => (
              <div key={idx} className="px-3 py-2 rounded-lg bg-muted/30 border">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">{m.label}</p>
                <p className="text-xs font-bold text-foreground mt-0.5 truncate" title={m.value}>
                  {m.value}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Step-by-Step Chronological Timeline */}
      <div className="bg-card border rounded-2xl shadow-sm p-5">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
          Chronological Activity Timeline (Initiation &rarr; Involved Parties &rarr; Notifications &rarr; Next Owner &rarr; Closure)
        </h4>

        {summary.events.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground border rounded-xl bg-muted/20">
            No lifecycle events available for this record yet.
          </div>
        ) : (
          <div className="relative pl-6 space-y-4 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
            {summary.events.map((ev: LifecycleTimelineEvent, idx: number) => {
              const detailPairs = formatDetailEntries(ev.details);
              return (
                <div key={ev.id || idx} className="relative">
                  {/* Timeline node */}
                  <div
                    className={cn(
                      'absolute -left-6 top-1 w-6 h-6 rounded-full flex items-center justify-center ring-4 ring-card shadow-xs',
                      getStageDotClass(ev.stage)
                    )}
                    title={ev.stage}
                  >
                    <StageIcon stage={ev.stage} />
                  </div>

                  <div className="border rounded-xl p-3.5 bg-background hover:bg-muted/10 transition-colors space-y-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-mono font-bold text-muted-foreground">
                          #{String(idx + 1).padStart(2, '0')}
                        </span>
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase',
                            getStageBadgeClass(ev.stage)
                          )}
                        >
                          {ev.stage}
                        </span>
                        <span className="text-sm font-bold text-foreground">{ev.action}</span>
                      </div>
                      <span className="text-[11px] font-mono text-muted-foreground whitespace-nowrap">
                        {ev.timestamp ? formatDateTime(ev.timestamp) : 'Timestamp unavailable'}
                      </span>
                    </div>

                    {/* Actor & Initiator Full Identity */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-muted-foreground">Performed by:</span>
                        <span className="font-bold text-foreground">{ev.actor.name}</span>
                        {ev.actor.employeeId && (
                          <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono font-bold text-primary">
                            EMP: {ev.actor.employeeId}
                          </span>
                        )}
                        {ev.actor.email && (
                          <span className="text-[11px] font-mono text-muted-foreground">({ev.actor.email})</span>
                        )}
                        {ev.actor.role && (
                          <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-semibold">
                            {ev.actor.role}
                          </span>
                        )}
                      </div>
                      {ev.initiatedBy && ev.initiatedBy.name !== ev.actor.name && (
                        <div className="text-[11px] text-muted-foreground">
                          Initiated by: <span className="font-semibold text-foreground">{formatActorInline(ev.initiatedBy)}</span>
                        </div>
                      )}
                    </div>

                    {/* Human-readable Summary */}
                    <p className="text-xs text-foreground/90">{ev.summary}</p>

                    {/* 5 Ws Audit Trace */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 p-2.5 rounded-lg border bg-muted/20 text-[11px]">
                      <div>
                        <span className="text-[10px] font-bold uppercase text-muted-foreground block">Date &amp; Time</span>
                        <span className="font-mono font-semibold text-foreground">{ev.timestamp ? formatDateTime(ev.timestamp) : 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase text-muted-foreground block">Who</span>
                        <span className="font-semibold text-foreground">{ev.actor.name}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase text-muted-foreground block">When</span>
                        <span className="font-medium text-foreground">{ev.when || ev.stage}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase text-muted-foreground block">Why</span>
                        <span className="font-medium text-foreground">{ev.why}</span>
                      </div>
                    </div>

                    {/* All Involved in This Single Activity */}
                    {ev.involvedParties && ev.involvedParties.length > 0 && (
                      <div className="p-2.5 rounded-lg border bg-muted/20 space-y-1">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1">
                          <Users className="w-3 h-3 text-primary" />
                          <span>All Involved in This Activity ({ev.involvedParties.length})</span>
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {ev.involvedParties.map((p, pIdx) => (
                            <span
                              key={pIdx}
                              className="px-2 py-0.5 rounded bg-background border text-[11px]"
                            >
                              <strong className="text-primary">{p.roleInActivity}:</strong> {p.name}
                              {p.employeeId ? ` [${p.employeeId}]` : ''}
                              {p.email ? ` (${p.email})` : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notified When Finished & Who Gets Next */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                      <div className="p-2.5 rounded-lg border bg-amber-50/40 space-y-1">
                        <p className="text-[10px] font-bold uppercase text-amber-800 flex items-center gap-1">
                          <BellRing className="w-3 h-3" />
                          <span>Notified When Finished</span>
                        </p>
                        {ev.notifiedOnFinish && ev.notifiedOnFinish.length > 0 ? (
                          <ul className="space-y-0.5 text-foreground">
                            {ev.notifiedOnFinish.map((item, nIdx) => (
                              <li key={nIdx}>• {item}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-muted-foreground">No notification sent at this step.</p>
                        )}
                      </div>

                      <div className="p-2.5 rounded-lg border bg-emerald-50/40 space-y-1">
                        <p className="text-[10px] font-bold uppercase text-emerald-700 flex items-center gap-1">
                          <ArrowRightCircle className="w-3 h-3" />
                          <span>After Finish &rarr; Who Gets Next</span>
                        </p>
                        <p className="font-semibold text-foreground">
                          {ev.nextAfterFinish || 'No further handoff required.'}
                        </p>
                      </div>
                    </div>

                    {/* Field Changes Diffs */}
                    {Array.isArray(ev.changes) && ev.changes.length > 0 && (
                      <div className="bg-muted/40 p-2.5 rounded-lg border space-y-1 text-[11px]">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground">Field Changes</p>
                        {ev.changes.map((c, cIdx) => (
                          <div key={cIdx} className="flex flex-wrap items-center gap-1.5 font-mono">
                            <span className="font-bold text-foreground">{c.field}:</span>
                            <span className="text-rose-600 line-through">{String(c.from ?? '—')}</span>
                            <span className="text-muted-foreground">&rarr;</span>
                            <span className="text-emerald-700 font-semibold">{String(c.to ?? '—')}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* All Metadata Details */}
                    {detailPairs.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5 pt-2 border-t border-dashed text-[11px]">
                        {detailPairs.map((pair, pIdx) => (
                          <div key={pIdx} className="flex flex-col">
                            <span className="text-[10px] font-bold uppercase text-muted-foreground">
                              {pair.label}
                            </span>
                            <span className="text-foreground break-words font-medium">{pair.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
        </React.Fragment>
      )}
    </div>
  );
};
