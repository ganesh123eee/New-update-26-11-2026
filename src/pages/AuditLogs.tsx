import React, { useState, useEffect } from 'react';
import { Search, History, User, Shield, Clock, Download, Calendar, X, BellRing, ArrowRightCircle, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { firestoreService } from '../services/firestoreService';
import { trainingRegisterService } from '../services/trainingRegisterService';
import {
  Assignment,
  AuditLog,
  Department,
  Evaluation,
  Submission,
  Template,
  TrainingRegister,
  TrainingRegisterTemplateConfig,
  User as UserType
} from '../types';
import { formatDateTime, cn } from '../lib/utils';
import { toast } from 'sonner';
import { AuditLifecyclePanel, SingleActivityDetailCard } from '../components/AuditLifecyclePanel';
import {
  buildEvaluationReportLifecycle,
  buildTrainingRegisterLifecycle,
  EnrichedAuditLog,
  enrichAuditLogEntry,
  formatActorInline,
  formatDetailEntries,
  LifecycleReportSummary
} from '../utils/auditLifecycle';

export default function AuditLogs() {
  const { user: currentUser } = useAuth();
  const [logs, setLogs] = useState<EnrichedAuditLog[]>([]);
  const [rawLogs, setRawLogs] = useState<AuditLog[]>([]);
  const [allUsers, setAllUsers] = useState<UserType[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [registers, setRegisters] = useState<TrainingRegister[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [templateConfig, setTemplateConfig] = useState<TrainingRegisterTemplateConfig | null>(null);
  const [selectedActivityLog, setSelectedActivityLog] = useState<EnrichedAuditLog | null>(null);
  const [selectedLifecycle, setSelectedLifecycle] = useState<LifecycleReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState({
    start: '',
    end: ''
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const [l, u, subs, assigns, evals, regs, temps, depts, tmplCfg] = await Promise.all([
          firestoreService.getCollection<AuditLog>('auditLogs'),
          firestoreService.getCollection<UserType>('users'),
          firestoreService.getCollection<Submission>('submissions'),
          firestoreService.getCollection<Assignment>('assignments'),
          firestoreService.getCollection<Evaluation>('reviews'),
          firestoreService.getCollection<TrainingRegister>('training_registers'),
          firestoreService.getCollection<Template>('templates'),
          firestoreService.getCollection<Department>('departments'),
          trainingRegisterService.getTemplateConfig().catch(() => null)
        ]);

        const sorted = [...l].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const enriched = sorted.map(log =>
          enrichAuditLogEntry(log, u, {
            submissions: subs,
            assignments: assigns,
            evaluations: evals,
            registers: regs,
            templates: temps,
            departments: depts,
            templateConfig: tmplCfg
          })
        );

        setRawLogs(sorted);
        setAllUsers(u);
        setSubmissions(subs);
        setAssignments(assigns);
        setEvaluations(evals);
        setRegisters(regs);
        setTemplates(temps);
        setDepartments(depts);
        setTemplateConfig(tmplCfg);
        setLogs(enriched);
        setLoading(false);
        await firestoreService.logActivity('Viewed Audit Logs', 'Audit Logs', {}, currentUser?.uid, currentUser?.email);
      } catch (error) {
        console.error('Error loading audit logs:', error);
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const openActivityInspector = (log: EnrichedAuditLog) => {
    setSelectedActivityLog(log);
    const subId = log.details?.submissionId || (log.resolvedEntityType === 'assessment_report' ? log.entityId : undefined);
    const assignId = log.details?.assignmentId || (log.resolvedEntityType === 'assignment' ? log.entityId : undefined);
    const regId = log.details?.registerId || (log.resolvedEntityType === 'training_register' ? log.entityId : undefined);

    if (regId) {
      const reg = registers.find(r => r.id === regId);
      if (reg) {
        setSelectedLifecycle(
          buildTrainingRegisterLifecycle({
            register: reg,
            users: allUsers,
            logs: rawLogs,
            templateConfig
          })
        );
        return;
      }
    }

    if (subId || assignId) {
      const sub = subId ? submissions.find(s => s.id === subId) : submissions.find(s => s.assignmentId === assignId);
      const assign = assignId
        ? assignments.find(a => a.id === assignId)
        : sub
        ? assignments.find(a => a.id === sub.assignmentId)
        : undefined;
      if (sub || assign) {
        const ev = sub ? evaluations.find(e => e.submissionId === sub.id) : undefined;
        const tmpl = templates.find(t => t.id === (sub?.templateId || assign?.templateId));
        setSelectedLifecycle(
          buildEvaluationReportLifecycle({
            submission: sub || null,
            assignment: assign || null,
            evaluation: ev || null,
            template: tmpl || null,
            users: allUsers,
            departments,
            logs: rawLogs,
            templateConfig
          })
        );
        return;
      }
    }

    setSelectedLifecycle(null);
  };

  const filteredLogs = logs.filter(log => {
    const resolvedType = log.resolvedEntityType;
    const matchesEntity = entityFilter === 'all' || resolvedType === entityFilter;
    if (!matchesEntity) return false;

    if (searchQuery.trim()) {
      const involvedText = log.involvedParties
        .map(p => `${p.roleInActivity} ${p.name} ${p.email || ''} ${p.employeeId || ''}`)
        .join(' ');
      const searchStr = `${log.stage} ${log.action} ${log.module} ${resolvedType} ${log.entityId || ''} ${log.entityTitle || ''} ${log.actor.name} ${log.actor.email} ${log.actor.employeeId || ''} ${log.actor.role || ''} ${involvedText} ${log.notifiedOnFinish.join(' ')} ${log.nextAfterFinish} ${JSON.stringify(log.details || {})} ${JSON.stringify(log.changes || [])}`.toLowerCase();
      if (!searchStr.includes(searchQuery.trim().toLowerCase())) {
        return false;
      }
    }
    
    if (dateFilter.start) {
      if (new Date(log.timestamp) < new Date(dateFilter.start)) return false;
    }
    if (dateFilter.end) {
      const endDate = new Date(dateFilter.end);
      endDate.setHours(23, 59, 59, 999);
      if (new Date(log.timestamp) > endDate) return false;
    }
    
    return true;
  });

  const handleSearch = () => {
    toast.success(`Showing ${filteredLogs.length} matching audit log${filteredLogs.length === 1 ? '' : 's'}`);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setEntityFilter('all');
    setDateFilter({ start: '', end: '' });
  };

  const handleDownloadCSV = () => {
    if (filteredLogs.length === 0) {
      toast.error('No logs to download');
      return;
    }

    const headers = [
      'Timestamp',
      'Lifecycle Stage',
      'Initiated By',
      'Performed By Name',
      'Performed By Employee ID',
      'Performed By Email',
      'Performed By Role',
      'Action',
      'Module',
      'Entity Type',
      'Entity / Report ID',
      'Entity Title',
      'All Involved in Activity',
      'Notified When Finished',
      'After Finish Who Gets Next',
      'Field Changes',
      'All Details'
    ];
    const csvContent = [
      headers.join(','),
      ...filteredLogs.map(log => {
        const details = formatDetailEntries(log.details).map(d => `${d.label}: ${d.value}`).join(' | ').replace(/"/g, '""');
        const changes = (log.changes || []).map(c => `${c.field}: ${c.from ?? '-'} -> ${c.to ?? '-'}`).join('; ').replace(/"/g, '""');
        const involved = log.involvedParties
          .map(p => `${p.roleInActivity}: ${p.name}${p.employeeId ? ` [${p.employeeId}]` : ''}${p.email ? ` (${p.email})` : ''}`)
          .join(' | ')
          .replace(/"/g, '""');
        const notified = log.notifiedOnFinish.join(' | ').replace(/"/g, '""');
        return [
          `"${formatDateTime(log.timestamp)}"`,
          `"${log.stage}"`,
          `"${(log.initiatedBy ? formatActorInline(log.initiatedBy) : formatActorInline(log.actor)).replace(/"/g, '""')}"`,
          `"${log.actor.name.replace(/"/g, '""')}"`,
          `"${(log.actor.employeeId || '').replace(/"/g, '""')}"`,
          `"${(log.actor.email || '').replace(/"/g, '""')}"`,
          `"${(log.actor.role || '').replace(/"/g, '""')}"`,
          `"${log.action.replace(/"/g, '""')}"`,
          `"${log.module}"`,
          `"${log.resolvedEntityType}"`,
          `"${log.entityId || ''}"`,
          `"${(log.entityTitle || '').replace(/"/g, '""')}"`,
          `"${involved}"`,
          `"${notified}"`,
          `"${(log.nextAfterFinish || '').replace(/"/g, '""')}"`,
          `"${changes}"`,
          `"${details}"`
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Audit logs downloaded successfully');
  };

  const entityCounts = {
    all: logs.length,
    assessment_report: logs.filter(l => l.resolvedEntityType === 'assessment_report').length,
    training_register: logs.filter(l => l.resolvedEntityType === 'training_register').length,
    template: logs.filter(l => l.resolvedEntityType === 'template').length,
    assignment: logs.filter(l => l.resolvedEntityType === 'assignment').length,
    system: logs.filter(l => l.resolvedEntityType === 'system').length,
  };

  const stats = {
    total: logs.length,
    today: logs.filter(l => new Date(l.timestamp).toDateString() === new Date().toDateString()).length,
    users: new Set(logs.map(l => l.userId)).size,
    modules: new Set(logs.map(l => l.module)).size
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Audit Logs</h1>
          <p className="text-muted-foreground mt-1">
            Full traceability showing who initiated, all involved people, who was notified on completion, and who gets the workflow next.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Logs', value: stats.total, icon: History, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Today\'s Activity', value: stats.today, icon: Clock, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Active Users', value: stats.users, icon: User, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Modules Tracked', value: stats.modules, icon: Shield, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map((stat, i) => (
          <div key={i} className="bg-card p-4 rounded-xl border shadow-sm flex items-center gap-4">
            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", stat.bg)}>
              <stat.icon className={cn("w-5 h-5", stat.color)} />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{stat.label}</p>
              <p className="text-2xl font-bold">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-muted/30 flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text"
              placeholder="Search by user name, employee ID, notified recipient, next owner, action..."
              className="w-full pl-10 pr-4 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
              className="px-3 py-2 bg-background border rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">All Report / Entity Types ({entityCounts.all})</option>
              <option value="assessment_report">Evaluation Reports ({entityCounts.assessment_report})</option>
              <option value="training_register">Training Registers ({entityCounts.training_register})</option>
              <option value="template">Templates ({entityCounts.template})</option>
              <option value="assignment">Assignments ({entityCounts.assignment})</option>
              <option value="system">System / Auth ({entityCounts.system})</option>
            </select>
            <div className="relative flex-1 md:w-40">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input 
                type="date"
                className="w-full pl-9 pr-3 py-2 bg-background border rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary/20"
                value={dateFilter.start}
                onChange={(e) => setDateFilter({ ...dateFilter, start: e.target.value })}
              />
            </div>
            <span className="text-muted-foreground text-xs">to</span>
            <div className="relative flex-1 md:w-40">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input 
                type="date"
                className="w-full pl-9 pr-3 py-2 bg-background border rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary/20"
                value={dateFilter.end}
                onChange={(e) => setDateFilter({ ...dateFilter, end: e.target.value })}
              />
            </div>
            {(dateFilter.start || dateFilter.end || searchQuery || entityFilter !== 'all') && (
              <button 
                onClick={handleClearFilters}
                className="p-2 hover:bg-accent rounded-lg text-muted-foreground transition-colors"
                title="Clear all filters"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button 
              onClick={handleSearch}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity whitespace-nowrap text-xs"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search</span>
            </button>
            <button 
              onClick={handleDownloadCSV}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors whitespace-nowrap text-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                <th className="px-4 py-4 font-semibold">S.No</th>
                <th className="px-4 py-4 font-semibold">Timestamp</th>
                <th className="px-4 py-4 font-semibold">Initiator &amp; Actor</th>
                <th className="px-4 py-4 font-semibold">Stage &amp; Action</th>
                <th className="px-4 py-4 font-semibold">Involved, Notified &amp; Next Handoff</th>
                <th className="px-4 py-4 font-semibold">Changes &amp; Details</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredLogs.map((log, index) => {
                const detailPairs = formatDetailEntries(log.details);
                return (
                <tr key={log.id} className="hover:bg-accent/50 transition-colors align-top">
                  <td className="px-4 py-4 text-sm font-medium">
                    {index + 1}
                  </td>
                  <td className="px-4 py-4 text-xs text-muted-foreground whitespace-nowrap font-mono">
                    {formatDateTime(log.timestamp)}
                  </td>
                  <td className="px-4 py-4 text-xs">
                    <div className="space-y-1 min-w-[170px]">
                      <div>
                        <p className="text-[10px] font-bold uppercase text-muted-foreground">Performed By</p>
                        <p className="font-bold text-foreground">{log.actor.name}</p>
                        {log.actor.employeeId && (
                          <span className="inline-block px-1.5 py-0.5 rounded bg-muted font-mono text-[10px] font-semibold text-primary">
                            ID: {log.actor.employeeId}
                          </span>
                        )}
                        {log.actor.email && (
                          <p className="text-[11px] font-mono text-muted-foreground">{log.actor.email}</p>
                        )}
                        {log.actor.role && (
                          <p className="text-[10px] text-primary font-semibold">{log.actor.role}</p>
                        )}
                      </div>
                      {log.initiatedBy && log.initiatedBy.name !== log.actor.name && (
                        <div className="pt-1 border-t border-dashed">
                          <p className="text-[10px] font-bold uppercase text-blue-700">Initiated By</p>
                          <p className="text-[11px] font-semibold text-foreground">{formatActorInline(log.initiatedBy)}</p>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-1 min-w-[150px]">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold uppercase">
                          {log.stage}
                        </span>
                        <span className="inline-block px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold uppercase">
                          {log.resolvedEntityType.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <span className={cn(
                        "inline-block px-2 py-1 rounded text-[10px] font-bold uppercase",
                        log.action.toLowerCase().includes('delete') ? "bg-rose-50 text-rose-700" :
                        log.action.toLowerCase().includes('create') || log.action.toLowerCase().includes('completed') ? "bg-emerald-50 text-emerald-700" :
                        log.action.toLowerCase().includes('update') ? "bg-blue-50 text-blue-700" : "bg-slate-50 text-slate-700"
                      )}>
                        {log.action}
                      </span>
                      {log.entityTitle && <p className="text-xs font-semibold text-foreground">{log.entityTitle}</p>}
                      {log.entityId && <p className="text-[10px] font-mono text-muted-foreground">ID: {log.entityId}</p>}
                      <button
                        type="button"
                        onClick={() => openActivityInspector(log)}
                        className="text-[11px] font-bold text-primary hover:underline inline-flex items-center gap-1 pt-0.5"
                      >
                        <History className="w-3 h-3" />
                        <span>Inspect Full Flow</span>
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-xs">
                    <div className="min-w-[260px] max-w-md space-y-2">
                      {/* All Involved */}
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1">
                          <Users className="w-3 h-3 text-primary" />
                          <span>Involved ({log.involvedParties.length})</span>
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {log.involvedParties.slice(0, 4).map((p, pIdx) => (
                            <span key={pIdx} className="px-1.5 py-0.5 rounded bg-muted/60 border text-[10px]">
                              <strong className="text-primary">{p.roleInActivity}:</strong> {p.name}
                            </span>
                          ))}
                          {log.involvedParties.length > 4 && (
                            <button
                              type="button"
                              onClick={() => openActivityInspector(log)}
                              className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold hover:underline"
                            >
                              +{log.involvedParties.length - 4} more
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Notified When Finished */}
                      {log.notifiedOnFinish.length > 0 && (
                        <div className="p-2 rounded-lg bg-amber-50/50 border border-amber-200/70 space-y-0.5">
                          <p className="text-[10px] font-bold uppercase text-amber-800 flex items-center gap-1">
                            <BellRing className="w-3 h-3" />
                            <span>Notified on Finish ({log.notifiedOnFinish.length})</span>
                          </p>
                          {log.notifiedOnFinish.slice(0, 3).map((n, nIdx) => (
                            <p key={nIdx} className="text-[11px] text-foreground leading-snug">• {n}</p>
                          ))}
                          {log.notifiedOnFinish.length > 3 && (
                            <button
                              type="button"
                              onClick={() => openActivityInspector(log)}
                              className="text-[10px] font-bold text-amber-800 hover:underline"
                            >
                              View all {log.notifiedOnFinish.length} notified recipients
                            </button>
                          )}
                        </div>
                      )}

                      {/* After Finish -> Who Gets Next */}
                      {log.nextAfterFinish && (
                        <div className="p-2 rounded-lg bg-emerald-50/50 border border-emerald-200/70 space-y-0.5">
                          <p className="text-[10px] font-bold uppercase text-emerald-700 flex items-center gap-1">
                            <ArrowRightCircle className="w-3 h-3" />
                            <span>Who Gets Next</span>
                          </p>
                          <p className="text-[11px] font-semibold text-foreground leading-snug">
                            {log.nextAfterFinish}
                          </p>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-xs text-muted-foreground">
                    <div className="min-w-[220px] max-w-md space-y-1.5">
                      {Array.isArray(log.changes) && log.changes.length > 0 && (
                        <div className="space-y-0.5 bg-muted/40 p-2 rounded border text-[11px]">
                          {log.changes.map((c: any, idx: number) => (
                            <div key={idx} className="flex flex-wrap gap-1.5">
                              <span className="font-bold text-foreground">{c.field}:</span>
                              <span className="text-rose-600 line-through">{String(c.from ?? '-')}</span>
                              <span>-&gt;</span>
                              <span className="text-emerald-700 font-semibold">{String(c.to ?? '-')}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {detailPairs.length > 0 ? (
                        <div className="grid grid-cols-1 gap-y-1 text-[11px]">
                          {detailPairs.map((pair, idx) => (
                            <div key={idx}>
                              <span className="font-bold text-muted-foreground">{pair.label}: </span>
                              <span className="text-foreground break-words">{pair.value}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        !log.changes?.length && <span>—</span>
                      )}
                    </div>
                  </td>
                </tr>
              )})}

              {filteredLogs.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center text-muted-foreground">
                    No audit logs found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Single Activity & Full Lifecycle Inspector Modal */}
      {(selectedActivityLog || selectedLifecycle) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-card w-full max-w-5xl max-h-[90vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden">
            <div className="p-5 border-b flex items-center justify-between bg-muted/20">
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  Activity Details &amp; End-to-End Workflow Traceability
                </h3>
                <p className="text-xs text-muted-foreground">
                  {selectedLifecycle?.entityTitle || selectedActivityLog?.entityTitle || selectedActivityLog?.action}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedActivityLog(null);
                  setSelectedLifecycle(null);
                }}
                className="p-2 hover:bg-accent rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 space-y-6">
              {selectedActivityLog && (
                <SingleActivityDetailCard log={selectedActivityLog} />
              )}
              {selectedLifecycle && (
                <AuditLifecyclePanel
                  summary={selectedLifecycle}
                  title="Complete Workflow Lifecycle (Initiation to Closure)"
                />
              )}
            </div>
            <div className="p-4 border-t bg-muted/10 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setSelectedActivityLog(null);
                  setSelectedLifecycle(null);
                }}
                className="px-5 py-2 border rounded-xl text-xs font-bold hover:bg-accent"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
