import React from 'react';
import {
  ArrowRightCircle,
  BellRing,
  CheckCircle2,
  Clock,
  Download,
  History,
  PlayCircle,
  ShieldCheck,
  UserCheck,
  Users,
  FileCheck2
} from 'lucide-react';
import { cn, formatDateTime } from '../lib/utils';
import {
  EnrichedAuditLog,
  formatActorInline,
  formatDetailEntries,
  LifecycleReportSummary,
  LifecycleStage,
  LifecycleTimelineEvent
} from '../utils/auditLifecycle';

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
    'Action / Milestone',
    'Initiated By',
    'Performed By Name',
    'Performed By Employee ID',
    'Performed By Email',
    'Performed By Role',
    'All Involved in Activity',
    'Notified When Finished',
    'Who Gets Next After Finish',
    'Summary',
    'Field Changes',
    'All Details'
  ];

  const rows = summary.events.map((ev, idx) => [
    idx + 1,
    ev.stage,
    ev.timestamp ? formatDateTime(ev.timestamp) : '-',
    ev.action,
    ev.initiatedBy ? formatActorInline(ev.initiatedBy) : formatActorInline(summary.initiatedBy),
    ev.actor.name,
    ev.actor.employeeId || '-',
    ev.actor.email || '-',
    ev.actor.role || '-',
    ev.involvedParties
      .map((p) => `${p.roleInActivity}: ${p.name}${p.employeeId ? ` [${p.employeeId}]` : ''}${p.email ? ` (${p.email})` : ''}`)
      .join(' | '),
    ev.notifiedOnFinish.join(' | ') || '-',
    ev.nextAfterFinish || '-',
    ev.summary,
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

export const AuditLifecyclePanel: React.FC<AuditLifecyclePanelProps> = ({
  summary,
  compact = false,
  onExportCsv,
  title
}) => {
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
                    'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border',
                    summary.isClosed
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  )}
                >
                  {summary.currentStatus}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {summary.entityTitle} • ID: <span className="font-mono">{summary.entityId}</span> • {summary.events.length} total activities tracked
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onExportCsv || (() => exportLifecycleCsv(summary, 'lifecycle_audit'))}
            className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-bold hover:bg-accent transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Full Lifecycle CSV</span>
          </button>
        </div>

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
    </div>
  );
};
