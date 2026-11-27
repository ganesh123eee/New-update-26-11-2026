import {
  Assignment,
  AuditChange,
  AuditLog,
  Department,
  Evaluation,
  Submission,
  Template,
  TrainingRegister,
  TrainingRegisterTemplateConfig,
  User
} from '../types';
import {
  AuditEntityCategory,
  inferAuditEntityType,
  inferAuditReason,
  inferAuditStage as inferDefaultAuditWhen
} from '../services/firestoreService';
import { formatQuestionnaireVersion } from '../lib/utils';

export interface ResolvedActor {
  uid?: string;
  name: string;
  email: string;
  employeeId?: string;
  role?: string;
}

export interface ActivityParticipant {
  name: string;
  email?: string;
  employeeId?: string;
  roleInActivity: string;
}

export type LifecycleStage =
  | 'Initiation'
  | 'In Progress'
  | 'Review / Signature'
  | 'Closing'
  | 'Post-Closure'
  | 'System';

export interface LifecycleTimelineEvent {
  id: string;
  stage: LifecycleStage;
  when: string;
  timestamp: string;
  action: string;
  why: string;
  actor: ResolvedActor;
  initiatedBy?: ResolvedActor;
  involvedParties: ActivityParticipant[];
  notifiedOnFinish: string[];
  nextAfterFinish: string;
  entityType: AuditEntityCategory;
  entityId: string;
  entityTitle: string;
  source: 'audit_log' | 'record_state';
  summary: string;
  changes?: AuditChange[];
  details: Record<string, any>;
}

export interface LifecycleReportSummary {
  entityType: AuditEntityCategory;
  entityId: string;
  entityTitle: string;
  currentStatus: string;
  isClosed: boolean;
  initiatedBy: ResolvedActor & { timestamp?: string };
  assignedOwner?: ResolvedActor;
  participant?: ResolvedActor & { department?: string };
  closedBy?: (ResolvedActor & { timestamp?: string }) | null;
  allInvolvedParties: ActivityParticipant[];
  notificationsSummary: string[];
  nextStepSummary: string;
  metrics?: Array<{ label: string; value: string }>;
  events: LifecycleTimelineEvent[];
}

export interface AuditEnrichmentContext {
  submissions?: Submission[];
  assignments?: Assignment[];
  evaluations?: Evaluation[];
  registers?: TrainingRegister[];
  templates?: Template[];
  departments?: Department[];
  templateConfig?: TrainingRegisterTemplateConfig | null;
}

export interface EnrichedAuditLog extends AuditLog {
  resolvedEntityType: AuditEntityCategory;
  stage: LifecycleStage;
  when: string;
  why: string;
  actor: ResolvedActor;
  initiatedBy?: ResolvedActor;
  involvedParties: ActivityParticipant[];
  notifiedOnFinish: string[];
  nextAfterFinish: string;
}

const formatRolesLabel = (user?: User | null): string => {
  if (!user) return '';
  const list = user.roles && user.roles.length > 0 ? user.roles : user.role ? [user.role] : [];
  return list.map((r) => r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())).join(', ');
};

export const formatActorInline = (actor?: Partial<ResolvedActor> | null): string => {
  if (!actor || !actor.name) return 'System';
  const parts = [actor.name];
  if (actor.employeeId) parts.push(`[${actor.employeeId}]`);
  if (actor.email) parts.push(`(${actor.email})`);
  return parts.join(' ');
};

export function resolveActorInfo(
  userIdOrEmail?: string | null,
  users: User[] = [],
  fallbackName?: string | null,
  fallbackEmail?: string | null
): ResolvedActor {
  const idLower = String(userIdOrEmail || '').toLowerCase().trim();
  const emailLower = String(fallbackEmail || '').toLowerCase().trim();
  const nameLower = String(fallbackName || '').toLowerCase().trim();

  const matched = users.find(
    (u) =>
      (userIdOrEmail && u.uid === userIdOrEmail) ||
      (idLower && u.email?.toLowerCase().trim() === idLower) ||
      (emailLower && u.email?.toLowerCase().trim() === emailLower) ||
      (userIdOrEmail && u.employeeId && u.employeeId === userIdOrEmail) ||
      (nameLower && u.displayName?.toLowerCase().trim() === nameLower)
  );

  if (matched) {
    return {
      uid: matched.uid,
      name: matched.displayName || fallbackName || matched.email || 'User',
      email: matched.email || fallbackEmail || '',
      employeeId: matched.employeeId,
      role: formatRolesLabel(matched)
    };
  }

  const resolvedEmail =
    fallbackEmail ||
    (userIdOrEmail && String(userIdOrEmail).includes('@') ? String(userIdOrEmail) : '');
  const resolvedName =
    fallbackName ||
    (resolvedEmail ? resolvedEmail.split('@')[0] : '') ||
    (userIdOrEmail && userIdOrEmail !== 'system' ? String(userIdOrEmail) : 'System');

  return {
    uid: userIdOrEmail || undefined,
    name: resolvedName,
    email: resolvedEmail
  };
}

function resolveQaRecipients(users: User[], templateConfig?: TrainingRegisterTemplateConfig | null): ResolvedActor[] {
  const qaMap = new Map<string, ResolvedActor>();
  for (const u of users) {
    if (u.status === 'inactive') continue;
    const roles = u.roles && u.roles.length > 0 ? u.roles : u.role ? [u.role] : [];
    if (roles.includes('quality_management')) {
      const key = (u.email || u.uid).toLowerCase().trim();
      qaMap.set(key, {
        uid: u.uid,
        name: u.displayName || u.email,
        email: u.email,
        employeeId: u.employeeId,
        role: 'Quality Management (QA)'
      });
    }
  }
  for (const email of templateConfig?.qualityTeamEmails || []) {
    const clean = email?.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!qaMap.has(key)) {
      const matched = users.find((u) => u.email?.toLowerCase().trim() === key);
      qaMap.set(key, {
        uid: matched?.uid,
        name: matched?.displayName || 'Quality Team',
        email: clean,
        employeeId: matched?.employeeId,
        role: 'Quality Team (Configured)'
      });
    }
  }
  return Array.from(qaMap.values());
}

function resolveItRecipients(users: User[], templateConfig?: TrainingRegisterTemplateConfig | null): ResolvedActor[] {
  const itMap = new Map<string, ResolvedActor>();
  for (const email of templateConfig?.itTeamEmails || []) {
    const clean = email?.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    const matched = users.find((u) => u.email?.toLowerCase().trim() === key);
    itMap.set(key, {
      uid: matched?.uid,
      name: matched?.displayName || 'IT Team',
      email: clean,
      employeeId: matched?.employeeId,
      role: 'IT Administration'
    });
  }
  return Array.from(itMap.values());
}

function resolveAssignmentTargets(assignment: Assignment | null | undefined, users: User[]): ResolvedActor[] {
  if (!assignment || !Array.isArray(assignment.targetIds)) return [];
  const targets =
    assignment.type === 'individual'
      ? users.filter((u) => assignment.targetIds.includes(u.uid) || assignment.targetIds.includes(u.email))
      : users.filter((u) => u.departmentId && assignment.targetIds.includes(u.departmentId) && u.status !== 'inactive');

  return targets.map((u) => resolveActorInfo(u.uid, users));
}

function dedupeParticipants(list: ActivityParticipant[]): ActivityParticipant[] {
  const map = new Map<string, ActivityParticipant>();
  for (const p of list) {
    if (!p.name) continue;
    const key = `${p.roleInActivity.toLowerCase()}|${(p.email || p.employeeId || p.name).toLowerCase()}`;
    if (!map.has(key)) {
      map.set(key, p);
    }
  }
  return Array.from(map.values());
}

function normalizeStringList(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (!item) return '';
        if (typeof item === 'string') return item;
        if (typeof item === 'object') {
          const name = item.name || item.displayName || '';
          const email = item.email || '';
          const role = item.role || item.roleInActivity || '';
          const empId = item.employeeId ? `[${item.employeeId}]` : '';
          return [role ? `${role}:` : '', name, empId, email ? `(${email})` : ''].filter(Boolean).join(' ');
        }
        return String(item);
      })
      .filter(Boolean);
  }
  if (typeof raw === 'string') return [raw];
  return [];
}

function normalizeParticipantList(raw: any): ActivityParticipant[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item) return null;
      if (typeof item === 'string') {
        return { name: item, roleInActivity: 'Participant' };
      }
      if (typeof item === 'object') {
        return {
          name: item.name || item.displayName || item.email || 'User',
          email: item.email,
          employeeId: item.employeeId,
          roleInActivity: item.roleInActivity || item.role || 'Participant'
        };
      }
      return null;
    })
    .filter(Boolean) as ActivityParticipant[];
}

export function inferAuditStage(log: {
  action?: string;
  module?: string;
  entityType?: string;
}): LifecycleStage {
  const act = String(log.action || '').toLowerCase();
  if (
    act.includes('create') ||
    act.includes('assign') ||
    act.includes('initiat') ||
    act.includes('draft')
  ) {
    return 'Initiation';
  }
  if (
    act.includes('completed') ||
    act.includes('sign-off') ||
    act.includes('closed') ||
    act.includes('delete')
  ) {
    return 'Closing';
  }
  if (
    act.includes('document review') ||
    act.includes('signed') ||
    act.includes('signature')
  ) {
    return 'Review / Signature';
  }
  if (
    act.includes('download') ||
    act.includes('export') ||
    act.includes('viewed evaluation report') ||
    act.includes('viewed report')
  ) {
    return 'Post-Closure';
  }
  if (
    act.includes('start') ||
    act.includes('submit') ||
    act.includes('update') ||
    act.includes('workflow')
  ) {
    return 'In Progress';
  }
  return 'System';
}

export function enrichAuditLogEntry(
  log: AuditLog,
  users: User[] = [],
  context?: AuditEnrichmentContext
): EnrichedAuditLog {
  const resolvedEntityType = inferAuditEntityType(log);
  const actor = resolveActorInfo(log.userId, users, undefined, log.userEmail);
  const stage = inferAuditStage(log);
  const det = log.details || {};

  // Start with explicit recorded metadata if present
  let initiatedBy: ResolvedActor | undefined = det.initiatedByName || det.initiatedByEmail
    ? resolveActorInfo(det.initiatedByUid, users, det.initiatedByName, det.initiatedByEmail)
    : undefined;
  let involvedParties: ActivityParticipant[] = normalizeParticipantList(det.involvedUsers);
  let notifiedOnFinish: string[] = normalizeStringList(det.notifiedRecipients);
  let nextAfterFinish: string =
    det.nextStepOwner || det.nextStepAction
      ? [det.nextStepOwner, det.nextStepAction].filter(Boolean).join(' — ')
      : '';

  const act = String(log.action || '').toLowerCase();
  const submissions = context?.submissions || [];
  const assignments = context?.assignments || [];
  const evaluations = context?.evaluations || [];
  const registers = context?.registers || [];
  const templateConfig = context?.templateConfig;

  const matchedSub =
    submissions.find((s) => s.id === (det.submissionId || log.entityId)) ||
    (det.assignmentId ? submissions.find((s) => s.assignmentId === det.assignmentId) : undefined);
  const matchedAssign =
    assignments.find((a) => a.id === (det.assignmentId || matchedSub?.assignmentId || log.entityId)) ||
    (Array.isArray(det.assignmentIds)
      ? assignments.find((a) => det.assignmentIds.includes(a.id))
      : undefined);
  const matchedEval = matchedSub
    ? evaluations.find((e) => e.submissionId === matchedSub.id)
    : undefined;
  const matchedReg = registers.find(
    (r) => r.id === (det.registerId || det.id || log.entityId)
  );

  // Dynamically backfill involved parties, initiator, notified recipients, and next step
  if (resolvedEntityType === 'training_register' || matchedReg) {
    if (matchedReg) {
      const regInitiator = resolveActorInfo(matchedReg.createdBy, users, matchedReg.createdByName);
      if (!initiatedBy) initiatedBy = regInitiator;
      const regTrainer = resolveActorInfo(
        matchedReg.trainerId || matchedReg.trainerEmail,
        users,
        matchedReg.trainerName,
        matchedReg.trainerEmail
      );
      const qaList = resolveQaRecipients(users, templateConfig);
      const itList = resolveItRecipients(users, templateConfig);

      if (involvedParties.length === 0) {
        const list: ActivityParticipant[] = [
          { ...regInitiator, roleInActivity: 'Initiator' },
          { ...regTrainer, roleInActivity: 'Designated Trainer' }
        ];
        if (act.includes('signed') || act.includes('document review')) {
          list.push({ ...actor, roleInActivity: det.role || `Attendee${det.slNo ? ` #${det.slNo}` : ''}` });
        } else {
          for (const a of matchedReg.attendees || []) {
            const aa = resolveActorInfo(a.userId || a.employeeId || a.email, users, a.traineeName, a.email);
            list.push({ ...aa, roleInActivity: `Attendee #${a.slNo}` });
          }
        }
        if (act.includes('completed')) {
          for (const q of qaList) list.push({ ...q, roleInActivity: 'QA Notified' });
          for (const it of itList) list.push({ ...it, roleInActivity: 'IT Notified' });
        }
        involvedParties = dedupeParticipants(list);
      }

      if (notifiedOnFinish.length === 0) {
        if (act.includes('created & started') || act.includes('started signing')) {
          const first = matchedReg.attendees?.[0];
          if (first) {
            notifiedOnFinish = [`Attendee #1: ${first.traineeName}${first.email ? ` (${first.email})` : ''} — Email & In-App Notification`];
          }
        } else if (act.includes('signed training register')) {
          const slNo = Number(det.slNo || 0);
          const nextAttendee = matchedReg.attendees?.find((a) => a.slNo === slNo + 1);
          if (nextAttendee) {
            notifiedOnFinish = [`Next Attendee #${nextAttendee.slNo}: ${nextAttendee.traineeName}${nextAttendee.email ? ` (${nextAttendee.email})` : ''} — Email & In-App Notification`];
          } else {
            notifiedOnFinish = [`Trainer: ${regTrainer.name}${regTrainer.email ? ` (${regTrainer.email})` : ''} — Email & In-App Notification`];
          }
        } else if (act.includes('completed training register')) {
          notifiedOnFinish = [
            ...qaList.map((q) => `QA: ${formatActorInline(q)}`),
            ...itList.map((it) => `IT: ${formatActorInline(it)}`)
          ];
        }
      }

      if (!nextAfterFinish) {
        if (act.includes('draft')) {
          nextAfterFinish = `${regInitiator.name} — Launch Signing Workflow to notify Attendee #1`;
        } else if (act.includes('created & started') || act.includes('started signing')) {
          const first = matchedReg.attendees?.[0];
          nextAfterFinish = first
            ? `Attendee #1: ${first.traineeName}${first.email ? ` (${first.email})` : ''} — Review SOP document & sign`
            : 'Attendees — Sequential document review & signatures';
        } else if (act.includes('confirmed document review')) {
          nextAfterFinish = `${actor.name} — Digital Signature unlocked (ready to sign)`;
        } else if (act.includes('signed training register')) {
          const slNo = Number(det.slNo || 0);
          const nextAttendee = matchedReg.attendees?.find((a) => a.slNo === slNo + 1);
          if (nextAttendee) {
            nextAfterFinish = `Attendee #${nextAttendee.slNo}: ${nextAttendee.traineeName}${nextAttendee.email ? ` (${nextAttendee.email})` : ''} — Review document & provide signature`;
          } else {
            nextAfterFinish = `Designated Trainer: ${regTrainer.name}${regTrainer.email ? ` (${regTrainer.email})` : ''} — Review document & provide final sign-off`;
          }
        } else if (act.includes('completed training register')) {
          nextAfterFinish = 'Quality Team & IT Administration notified — Register Closed & Verified';
        }
      }
    }
  } else if (resolvedEntityType === 'assessment_report' || resolvedEntityType === 'assignment' || matchedSub || matchedAssign) {
    const initiator = matchedAssign
      ? resolveActorInfo(matchedAssign.assignedBy, users)
      : act.includes('assign') || act.includes('create')
      ? actor
      : undefined;
    if (!initiatedBy && initiator) initiatedBy = initiator;

    const assessorActor = matchedEval?.reviewerId || matchedAssign?.reviewerId || det.reviewerId
      ? resolveActorInfo(matchedEval?.reviewerId || matchedAssign?.reviewerId || det.reviewerId, users)
      : undefined;
    const candidateActor = matchedSub?.employeeId || det.employeeId
      ? resolveActorInfo(matchedSub?.employeeId || det.employeeId, users, det.employeeName)
      : undefined;
    const targetCandidates = resolveAssignmentTargets(matchedAssign, users);
    const qaList = resolveQaRecipients(users, templateConfig);

    if (involvedParties.length === 0) {
      const list: ActivityParticipant[] = [];
      if (initiator) list.push({ ...initiator, roleInActivity: 'Initiator / Assigner' });
      if (candidateActor) {
        list.push({ ...candidateActor, roleInActivity: 'Trainee / Candidate' });
      } else {
        for (const t of targetCandidates) {
          list.push({ ...t, roleInActivity: 'Assigned Trainee' });
        }
      }
      if (assessorActor) list.push({ ...assessorActor, roleInActivity: 'Assigned Assessor' });
      if (act.includes('completed evaluation')) {
        for (const q of qaList) list.push({ ...q, roleInActivity: 'QA Notified' });
      }
      if (list.length === 0) list.push({ ...actor, roleInActivity: 'Actor' });
      involvedParties = dedupeParticipants(list);
    }

    if (notifiedOnFinish.length === 0) {
      if (act.includes('assigned') || act.includes('assignment')) {
        const list = targetCandidates.map((t) => `Trainee: ${formatActorInline(t)} (Email + In-App)`);
        if (assessorActor) list.push(`Assessor: ${formatActorInline(assessorActor)} (In-App Notification)`);
        notifiedOnFinish = list;
      } else if (act.includes('submitted assessment')) {
        const tabs = Number(det.tabSwitchCount || matchedSub?.tabSwitchCount || 0);
        if (tabs > 0 && assessorActor) {
          notifiedOnFinish = [`Tab-Switch Security Alert sent to Assigned Assessor (${formatActorInline(assessorActor)}) & Super Admins`];
        } else if (assessorActor) {
          notifiedOnFinish = [`Submission queued for Assigned Assessor: ${formatActorInline(assessorActor)}`];
        }
      } else if (act.includes('completed evaluation')) {
        const list: string[] = [];
        if (candidateActor) list.push(`Trainee: ${formatActorInline(candidateActor)} (Email + In-App)`);
        if (assessorActor) list.push(`Assessor: ${formatActorInline(assessorActor)} (Email + In-App)`);
        for (const q of qaList) list.push(`QA: ${formatActorInline(q)} (Email + In-App)`);
        notifiedOnFinish = list;
      }
    }

    if (!nextAfterFinish) {
      if (act.includes('assigned') || act.includes('assignment')) {
        const names = targetCandidates.map((t) => t.name).join(', ') || 'Assigned Trainee(s)';
        nextAfterFinish = `${names} — Start & complete assessment before due date (${matchedAssign?.dueDate || 'N/A'})`;
      } else if (act.includes('started assessment')) {
        nextAfterFinish = `${candidateActor?.name || actor.name} — Answer all questions and submit assessment`;
      } else if (act.includes('submitted assessment')) {
        nextAfterFinish = `${assessorActor ? formatActorInline(assessorActor) : 'Assigned Assessor'} — Evaluate submission & finalize score/result`;
      } else if (act.includes('completed evaluation')) {
        const retest = Boolean(det.retestRequired ?? matchedEval?.retestRequired);
        nextAfterFinish = retest
          ? `HR/QM & Trainee (${candidateActor?.name || 'Candidate'}) — Re-assessment required & report archived with QA`
          : `Quality Assurance (QA) & Trainee (${candidateActor?.name || 'Candidate'}) — Final report closed & distributed`;
      }
    }
  }

  if (involvedParties.length === 0) {
    involvedParties = [{ ...actor, roleInActivity: 'Performed By' }];
  }
  if (!initiatedBy && stage === 'Initiation') {
    initiatedBy = actor;
  }

  const when = log.when || inferDefaultAuditWhen(log.action, log.module, log.details);
  const why = log.why || inferAuditReason(log.action, log.module, log.details);

  return {
    ...log,
    resolvedEntityType,
    stage,
    when,
    why,
    actor,
    initiatedBy,
    involvedParties,
    notifiedOnFinish,
    nextAfterFinish
  };
}

const EXCLUDED_RAW_DETAIL_KEYS = new Set([
  'involvedUsers',
  'notifiedRecipients',
  'nextStepOwner',
  'nextStepAction',
  'initiatedByUid',
  'initiatedByName',
  'initiatedByEmail',
  'initiatedByEmployeeId'
]);

export function formatDetailEntries(
  details: any,
  excludeHandoffKeys: boolean = true
): Array<{ label: string; value: string }> {
  if (!details || typeof details !== 'object') return [];
  const entries: Array<{ label: string; value: string }> = [];
  for (const [key, val] of Object.entries(details)) {
    if (excludeHandoffKeys && EXCLUDED_RAW_DETAIL_KEYS.has(key)) continue;
    if (val === undefined || val === null || val === '') continue;
    const label = key
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
    let valueStr: string;
    if (Array.isArray(val)) {
      valueStr = val.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ');
    } else if (typeof val === 'object') {
      valueStr = JSON.stringify(val);
    } else if (typeof val === 'boolean') {
      valueStr = val ? 'Yes' : 'No';
    } else {
      valueStr = String(val);
    }
    if (valueStr.trim() !== '') {
      entries.push({ label, value: valueStr });
    }
  }
  return entries;
}

const sortEventsAsc = (events: LifecycleTimelineEvent[]) =>
  [...events].sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());

export function matchesSubmissionOrAssignmentLog(
  log: AuditLog,
  submissionId?: string,
  assignmentId?: string
): boolean {
  if (submissionId) {
    if (log.entityId === submissionId || log.details?.submissionId === submissionId || log.details?.id === submissionId) {
      return true;
    }
  }
  if (assignmentId) {
    if (
      log.entityId === assignmentId ||
      log.details?.assignmentId === assignmentId ||
      (Array.isArray(log.details?.assignmentIds) && log.details.assignmentIds.includes(assignmentId))
    ) {
      return true;
    }
  }
  return false;
}

export function buildEvaluationReportLifecycle(params: {
  submission?: Submission | null;
  assignment?: Assignment | null;
  evaluation?: Evaluation | null;
  template?: Template | null;
  users: User[];
  departments?: Department[];
  logs: AuditLog[];
  templateConfig?: TrainingRegisterTemplateConfig | null;
}): LifecycleReportSummary {
  const { submission, assignment, evaluation, template, users, departments = [], logs, templateConfig } = params;

  const entityId = submission?.id || assignment?.id || 'unknown';
  const candidateActor = submission?.employeeId
    ? resolveActorInfo(submission.employeeId, users)
    : { name: 'Assigned Candidate', email: '' };
  const candidateUser = users.find((u) => u.uid === submission?.employeeId);
  const deptName = candidateUser?.departmentId
    ? departments.find((d) => d.id === candidateUser.departmentId)?.name || candidateUser.departmentId
    : undefined;

  const assessorId = evaluation?.reviewerId || assignment?.reviewerId;
  const assessorActor = assessorId ? resolveActorInfo(assessorId, users) : undefined;
  const targetCandidates = resolveAssignmentTargets(assignment, users);
  const qaRecipients = resolveQaRecipients(users, templateConfig);

  const templateVer = formatQuestionnaireVersion(template?.version);
  const entityTitle = `${template?.name || 'Assessment'}${templateVer ? ` (${templateVer})` : ''} — ${
    submission ? candidateActor.name : targetCandidates.map((t) => t.name).join(', ') || 'Assigned'
  }`;

  const matchedLogs = logs.filter((l) => matchesSubmissionOrAssignmentLog(l, submission?.id, assignment?.id));

  const findLog = (predicate: (l: AuditLog) => boolean) => matchedLogs.find(predicate);

  const assignCreateLog = findLog((l) => {
    const act = l.action.toLowerCase();
    return act.includes('created assessment assignment') || act.includes('assigned assessment');
  });
  const startedLog = findLog((l) => l.action.toLowerCase().includes('started assessment'));
  const submittedLog = findLog((l) => l.action.toLowerCase().includes('submitted assessment'));
  const evaluatedLog = findLog((l) => l.action.toLowerCase().includes('completed evaluation'));

  const initiatorActor = resolveActorInfo(
    assignment?.assignedBy || assignCreateLog?.userId,
    users,
    assignCreateLog?.details?.initiatedByName,
    assignCreateLog?.userEmail
  );
  const initiatedAt = assignment?.createdAt || assignCreateLog?.timestamp || (submission as any)?.createdAt || submission?.submittedAt || '';

  const allInvolved: ActivityParticipant[] = dedupeParticipants([
    { ...initiatorActor, roleInActivity: 'Initiator / Assigner' },
    ...(submission
      ? [{ ...candidateActor, roleInActivity: 'Trainee / Candidate' }]
      : targetCandidates.map((t) => ({ ...t, roleInActivity: 'Assigned Trainee' }))),
    ...(assessorActor ? [{ ...assessorActor, roleInActivity: 'Assigned Assessor' }] : []),
    ...qaRecipients.map((q) => ({ ...q, roleInActivity: 'QA (Completion Notified)' }))
  ]);

  const events: LifecycleTimelineEvent[] = [];
  const consumedLogIds = new Set<string>();

  // 1. Initiation / Assignment Created
  if (assignment || assignCreateLog) {
    if (assignCreateLog) consumedLogIds.add(assignCreateLog.id);
    const targetNames =
      assignment?.type === 'department'
        ? (assignment.targetIds || [])
            .map((did) => departments.find((d) => d.id === did)?.name || did)
            .join(', ')
        : targetCandidates.map((t) => t.name).join(', ') || candidateActor.name;

    const assignNotified = normalizeStringList(assignCreateLog?.details?.notifiedRecipients);
    const fallbackAssignNotified = [
      ...(targetCandidates.length > 0 ? targetCandidates : submission ? [candidateActor] : []).map(
        (t) => `Trainee: ${formatActorInline(t)} (Email & In-App)`
      ),
      ...(assessorActor ? [`Assessor: ${formatActorInline(assessorActor)} (In-App Notification)`] : [])
    ];

    events.push({
      id: assignCreateLog?.id || `init-${entityId}`,
      stage: 'Initiation',
      when: assignCreateLog?.when || inferDefaultAuditWhen(assignCreateLog?.action || 'Assigned Assessment', 'Assignments', assignCreateLog?.details),
      timestamp: initiatedAt,
      action: assignCreateLog?.action || 'Assessment Initiated & Assigned',
      why: assignCreateLog?.why || inferAuditReason(assignCreateLog?.action || 'Assigned Assessment', 'Assignments', assignCreateLog?.details),
      actor: initiatorActor,
      initiatedBy: initiatorActor,
      involvedParties: dedupeParticipants([
        { ...initiatorActor, roleInActivity: 'Initiator' },
        ...(targetCandidates.length > 0
          ? targetCandidates.map((t) => ({ ...t, roleInActivity: 'Assigned Trainee' }))
          : [{ ...candidateActor, roleInActivity: 'Assigned Trainee' }]),
        ...(assessorActor ? [{ ...assessorActor, roleInActivity: 'Assigned Assessor' }] : [])
      ]),
      notifiedOnFinish: assignNotified.length > 0 ? assignNotified : fallbackAssignNotified,
      nextAfterFinish:
        assignCreateLog?.details?.nextStepOwner ||
        `${targetNames || 'Assigned Candidate(s)'} — Start & complete assessment by Due Date (${assignment?.dueDate || 'N/A'})`,
      entityType: 'assessment_report',
      entityId,
      entityTitle,
      source: assignCreateLog ? 'audit_log' : 'record_state',
      summary: `Initiated by ${initiatorActor.name}. Assigned "${template?.name || 'Assessment'}"${templateVer ? ` (${templateVer})` : ''} to ${targetNames || 'candidate(s)'} with Assessor ${assessorActor?.name || 'N/A'}.`,
      changes: assignCreateLog?.changes,
      details: {
        ...(assignCreateLog?.details || {}),
        templateName: template?.name || 'Assessment',
        ...(templateVer ? { templateVersion: templateVer } : {}),
        documentCode: template?.documentCode || 'N/A',
        assignmentId: assignment?.id || assignCreateLog?.details?.assignmentId,
        assignmentMode: assignment?.type || assignCreateLog?.details?.type || 'individual',
        assignedAssessor: assessorActor ? formatActorInline(assessorActor) : 'N/A',
        dueDate: assignment?.dueDate || 'N/A',
        durationLimitMinutes: assignment?.duration || template?.duration || 30,
        attemptLimit: assignment?.attemptLimit || 1,
        allowRetest: assignment?.allowRetest ?? false,
        notificationsEnabled: assignment?.notificationEnabled ?? true
      }
    });
  }

  // 2. Assessment Started by Candidate
  const startedAt = startedLog?.timestamp || (submission as any)?.createdAt;
  if (submission && (startedLog || startedAt)) {
    if (startedLog) consumedLogIds.add(startedLog.id);
    events.push({
      id: startedLog?.id || `start-${submission.id}`,
      stage: 'In Progress',
      when: startedLog?.when || inferDefaultAuditWhen(startedLog?.action || 'Started Assessment', 'Assessments', startedLog?.details),
      timestamp: startedAt || submission.submittedAt,
      action: startedLog?.action || 'Started Assessment',
      why: startedLog?.why || inferAuditReason(startedLog?.action || 'Started Assessment', 'Assessments', startedLog?.details),
      actor: candidateActor,
      initiatedBy: initiatorActor,
      involvedParties: dedupeParticipants([
        { ...candidateActor, roleInActivity: 'Trainee / Candidate' },
        { ...initiatorActor, roleInActivity: 'Initiator' },
        ...(assessorActor ? [{ ...assessorActor, roleInActivity: 'Assigned Assessor' }] : [])
      ]),
      notifiedOnFinish: normalizeStringList(startedLog?.details?.notifiedRecipients),
      nextAfterFinish: `${candidateActor.name} — Answer all questions and submit assessment`,
      entityType: 'assessment_report',
      entityId,
      entityTitle,
      source: startedLog ? 'audit_log' : 'record_state',
      summary: `${candidateActor.name} opened and started the assessment.`,
      changes: startedLog?.changes,
      details: {
        ...(startedLog?.details || {}),
        submissionId: submission.id,
        traineeName: candidateActor.name,
        employeeId: candidateActor.employeeId || submission.employeeId,
        department: deptName || 'N/A',
        templateName: template?.name || 'Assessment',
        ...(templateVer ? { templateVersion: templateVer } : {})
      }
    });
  }

  // 3. Assessment Submitted by Candidate
  if (submission && submission.status !== 'in_progress') {
    if (submittedLog) consumedLogIds.add(submittedLog.id);
    const totalQuestions = template?.questions?.length || Object.keys(submission.answers || {}).length;
    const answeredCount = Object.values(submission.answers || {}).filter(
      (v) => v !== undefined && v !== null && String(v).trim() !== ''
    ).length;
    const durationMin = Math.floor((submission.durationTaken || 0) / 60);
    const durationSec = (submission.durationTaken || 0) % 60;
    const recordedSubmitNotified = normalizeStringList(submittedLog?.details?.notifiedRecipients);
    const fallbackSubmitNotified = [
      ...(assessorActor
        ? [`Assigned Assessor: ${formatActorInline(assessorActor)} (Pending Evaluation Queue)`]
        : ['Assigned Assessor (Pending Evaluation Queue)']),
      ...((submission.tabSwitchCount || 0) > 0
        ? [`Tab-Switch Security Alert sent to Assessor & Super Admins (${submission.tabSwitchCount} violations)`]
        : [])
    ];

    events.push({
      id: submittedLog?.id || `submit-${submission.id}`,
      stage: 'In Progress',
      when: submittedLog?.when || inferDefaultAuditWhen(submittedLog?.action || 'Submitted Assessment', 'Assessments', submittedLog?.details),
      timestamp: submittedLog?.timestamp || submission.submittedAt,
      action: submittedLog?.action || 'Submitted Assessment',
      why: submittedLog?.why || inferAuditReason(submittedLog?.action || 'Submitted Assessment', 'Assessments', submittedLog?.details),
      actor: candidateActor,
      initiatedBy: initiatorActor,
      involvedParties: dedupeParticipants([
        { ...candidateActor, roleInActivity: 'Trainee / Submitter' },
        ...(assessorActor ? [{ ...assessorActor, roleInActivity: 'Next Owner (Assessor)' }] : []),
        { ...initiatorActor, roleInActivity: 'Initiator' }
      ]),
      notifiedOnFinish: recordedSubmitNotified.length > 0 ? recordedSubmitNotified : fallbackSubmitNotified,
      nextAfterFinish: assessorActor
        ? `Assigned Assessor: ${formatActorInline(assessorActor)} — Perform evaluation, score answers & finalize result`
        : 'Assigned Assessor — Perform evaluation & finalize result',
      entityType: 'assessment_report',
      entityId,
      entityTitle,
      source: submittedLog ? 'audit_log' : 'record_state',
      summary: `${candidateActor.name} submitted ${answeredCount}/${totalQuestions} answers in ${durationMin}m ${durationSec}s. Handed off to Assessor ${assessorActor?.name || 'N/A'}.`,
      changes: submittedLog?.changes,
      details: {
        ...(submittedLog?.details || {}),
        submissionId: submission.id,
        questionsAnswered: `${answeredCount} / ${totalQuestions}`,
        durationTaken: `${durationMin}m ${durationSec}s`,
        tabSwitchViolations: submission.tabSwitchCount || 0,
        submissionStatus: submission.status
      }
    });
  }

  // 4. Evaluation & Closure
  let closedBy: (ResolvedActor & { timestamp?: string }) | null = null;
  const evalNotifiedList: string[] = [];
  if (evaluation || evaluatedLog) {
    if (evaluatedLog) consumedLogIds.add(evaluatedLog.id);
    const evalActor = resolveActorInfo(
      evaluation?.reviewerId || evaluatedLog?.userId,
      users,
      undefined,
      evaluatedLog?.userEmail
    );
    const evalTimestamp = evaluation?.reviewedAt || evaluatedLog?.timestamp || '';
    closedBy = { ...evalActor, timestamp: evalTimestamp };

    const scoreVal = evaluation?.finalScore ?? evaluatedLog?.details?.score;
    const resultVal = (evaluation?.result || evaluatedLog?.details?.result || '').toUpperCase();
    const retest = Boolean(evaluation?.retestRequired ?? evaluatedLog?.details?.retestRequired);

    const recordedEvalNotified = normalizeStringList(evaluatedLog?.details?.notifiedRecipients);
    const computedEvalNotified =
      recordedEvalNotified.length > 0
        ? recordedEvalNotified
        : [
            `Trainee: ${formatActorInline(candidateActor)} (Email & In-App)`,
            `Assessor: ${formatActorInline(evalActor)} (Email & In-App)`,
            ...(qaRecipients.length > 0
              ? qaRecipients.map((q) => `QA: ${formatActorInline(q)} (Email & In-App)`)
              : ['Quality Management (QA) Team (Email & In-App)'])
          ];
    evalNotifiedList.push(...computedEvalNotified);

    const nextStr =
      evaluatedLog?.details?.nextStepOwner ||
      (retest
        ? `HR/QM & Trainee (${candidateActor.name}) — Re-assessment required; Final report shared with QA & Trainee`
        : `Quality Assurance (QA) & Trainee (${candidateActor.name}) — Assessment closed & final report archived`);

    events.push({
      id: evaluatedLog?.id || `eval-${evaluation?.id || entityId}`,
      stage: 'Closing',
      when: evaluatedLog?.when || inferDefaultAuditWhen(evaluatedLog?.action || 'Completed Evaluation', 'Evaluations', evaluatedLog?.details),
      timestamp: evalTimestamp,
      action: evaluatedLog?.action || 'Completed Evaluation & Closed Report',
      why: evaluatedLog?.why || inferAuditReason(evaluatedLog?.action || 'Completed Evaluation', 'Evaluations', evaluatedLog?.details),
      actor: evalActor,
      initiatedBy: initiatorActor,
      involvedParties: dedupeParticipants([
        { ...evalActor, roleInActivity: 'Assessor (Closed Report)' },
        { ...candidateActor, roleInActivity: 'Trainee (Notified)' },
        { ...initiatorActor, roleInActivity: 'Initiator' },
        ...qaRecipients.map((q) => ({ ...q, roleInActivity: 'QA (Notified)' }))
      ]),
      notifiedOnFinish: computedEvalNotified,
      nextAfterFinish: nextStr,
      entityType: 'assessment_report',
      entityId,
      entityTitle,
      source: evaluatedLog ? 'audit_log' : 'record_state',
      summary: `Evaluated and closed by ${evalActor.name}. Final Score: ${scoreVal !== undefined ? `${Number(scoreVal).toFixed(1)}%` : 'N/A'} | Result: ${resultVal || 'N/A'}.`,
      changes: evaluatedLog?.changes || [
        { field: 'Status', from: 'submitted', to: 'completed' },
        ...(scoreVal !== undefined ? [{ field: 'Final Score', from: '-', to: `${Number(scoreVal).toFixed(1)}%` }] : []),
        ...(resultVal ? [{ field: 'Result', from: '-', to: resultVal }] : []),
        { field: 'Retest Required', from: '-', to: retest ? 'Yes' : 'No' }
      ],
      details: {
        ...(evaluatedLog?.details || {}),
        evaluationId: evaluation?.id,
        assessorName: evalActor.name,
        assessorEmail: evalActor.email,
        finalScore: scoreVal !== undefined ? `${Number(scoreVal).toFixed(1)}%` : 'N/A',
        result: resultVal || 'N/A',
        retestRequired: retest,
        overallComments: evaluation?.overallComments || 'N/A'
      }
    });
  }

  // 5. Merge remaining recorded auditLogs (views, downloads, tab switch warnings, edits)
  for (const log of matchedLogs) {
    if (consumedLogIds.has(log.id)) continue;
    const enriched = enrichAuditLogEntry(log, users, {
      submissions: submission ? [submission] : [],
      assignments: assignment ? [assignment] : [],
      evaluations: evaluation ? [evaluation] : [],
      templates: template ? [template] : [],
      departments,
      templateConfig
    });
    events.push({
      id: log.id,
      stage: enriched.stage,
      when: enriched.when,
      timestamp: log.timestamp,
      action: log.action,
      why: enriched.why,
      actor: enriched.actor,
      initiatedBy: enriched.initiatedBy || initiatorActor,
      involvedParties: enriched.involvedParties,
      notifiedOnFinish: enriched.notifiedOnFinish,
      nextAfterFinish: enriched.nextAfterFinish || 'No further workflow handoff required (Audit Record)',
      entityType: 'assessment_report',
      entityId,
      entityTitle,
      source: 'audit_log',
      summary: `${log.action} performed by ${enriched.actor.name}${enriched.actor.email ? ` (${enriched.actor.email})` : ''}.`,
      changes: log.changes,
      details: log.details || {}
    });
  }

  const sortedEvents = sortEventsAsc(events);
  const currentStatus = evaluation
    ? `Closed (${evaluation.result.toUpperCase()} - ${evaluation.finalScore.toFixed(1)}%)`
    : submission
    ? submission.status === 'in_progress'
      ? 'In Progress (Candidate Taking Assessment)'
      : 'Submitted (Awaiting Assessor Closure)'
    : 'Assigned (Not Started)';

  const nextStepSummary = evaluation
    ? evaluation.retestRequired
      ? `Re-assessment required for ${candidateActor.name}; completion report delivered to Trainee, Assessor & QA.`
      : `Workflow closed — completion report delivered to Trainee, Assessor & QA.`
    : submission
    ? submission.status === 'in_progress'
      ? `Waiting for ${candidateActor.name} to complete & submit.`
      : `Next: Assigned Assessor (${assessorActor ? formatActorInline(assessorActor) : 'N/A'}) to evaluate & close.`
    : `Next: Assigned Trainee(s) (${targetCandidates.map((t) => t.name).join(', ') || 'Pending'}) to start & submit.`;

  return {
    entityType: 'assessment_report',
    entityId,
    entityTitle,
    currentStatus,
    isClosed: Boolean(evaluation || submission?.status === 'completed'),
    initiatedBy: { ...initiatorActor, timestamp: initiatedAt },
    assignedOwner: assessorActor,
    participant: submission ? { ...candidateActor, department: deptName } : undefined,
    closedBy,
    allInvolvedParties: allInvolved,
    notificationsSummary:
      evalNotifiedList.length > 0
        ? evalNotifiedList
        : sortedEvents[sortedEvents.length - 1]?.notifiedOnFinish || [],
    nextStepSummary,
    metrics: [
      { label: 'Template & Version', value: `${template?.name || 'Assessment'}${templateVer ? ` (${templateVer})` : ''}` },
      { label: 'Final Score', value: evaluation ? `${evaluation.finalScore.toFixed(1)}%` : 'Pending' },
      { label: 'Result', value: evaluation ? evaluation.result.toUpperCase() : 'Pending' },
      { label: 'Tab Switches', value: String(submission?.tabSwitchCount ?? 0) }
    ],
    events: sortedEvents
  };
}

export function buildTrainingRegisterLifecycle(params: {
  register: TrainingRegister;
  users: User[];
  logs: AuditLog[];
  templateConfig?: TrainingRegisterTemplateConfig | null;
}): LifecycleReportSummary {
  const { register, users, logs, templateConfig } = params;
  const entityId = register.id;
  const entityTitle = `${register.trainingTitle || 'Training Register'} (${register.date})`;

  const matchedLogs = logs.filter(
    (l) => l.entityId === entityId || l.details?.id === entityId || l.details?.registerId === entityId
  );

  const createLog = matchedLogs.find((l) => {
    const act = l.action.toLowerCase();
    return act.includes('created training register') || act.includes('created & started');
  });
  const startWorkflowLog = matchedLogs.find((l) => {
    const act = l.action.toLowerCase();
    return act.includes('started signing workflow') || act.includes('created & started');
  });
  const trainerCompleteLog = matchedLogs.find((l) =>
    l.action.toLowerCase().includes('completed training register')
  );

  const initiatorActor = resolveActorInfo(
    register.createdBy || createLog?.userId,
    users,
    register.createdByName || createLog?.details?.initiatedByName,
    createLog?.userEmail
  );
  const trainerActor = resolveActorInfo(
    register.trainerId || register.trainerEmail,
    users,
    register.trainerName,
    register.trainerEmail
  );

  const attendeeActors = (register.attendees || []).map((a) => ({
    attendee: a,
    actor: resolveActorInfo(a.userId || a.employeeId || a.email, users, a.traineeName, a.email)
  }));
  const qaRecipients = resolveQaRecipients(users, templateConfig);
  const itRecipients = resolveItRecipients(users, templateConfig);

  const allInvolved: ActivityParticipant[] = dedupeParticipants([
    { ...initiatorActor, roleInActivity: 'Initiator' },
    { ...trainerActor, roleInActivity: 'Designated Trainer' },
    ...attendeeActors.map(({ attendee, actor }) => ({
      ...actor,
      roleInActivity: `Attendee #${attendee.slNo} (${attendee.status})`
    })),
    ...qaRecipients.map((q) => ({ ...q, roleInActivity: 'QA (Completion Notified)' })),
    ...itRecipients.map((it) => ({ ...it, roleInActivity: 'IT (Completion Notified)' }))
  ]);

  const events: LifecycleTimelineEvent[] = [];
  const consumedLogIds = new Set<string>();

  const firstAttendee = attendeeActors[0];
  const launchedImmediately = Boolean(createLog?.action.toLowerCase().includes('started') || (register.workflowStatus !== 'draft' && !startWorkflowLog));

  // 1. Initiation
  if (createLog) consumedLogIds.add(createLog.id);
  const initiatedAt = createLog?.timestamp || register.createdAt || register.updatedAt;
  events.push({
    id: createLog?.id || `reg-init-${entityId}`,
    stage: 'Initiation',
    when: createLog?.when || inferDefaultAuditWhen(createLog?.action || 'Created Training Register', 'Training Registers', createLog?.details),
    timestamp: initiatedAt,
    action: createLog?.action || 'Training Register Initiated',
    why: createLog?.why || inferAuditReason(createLog?.action || 'Created Training Register', 'Training Registers', createLog?.details),
    actor: initiatorActor,
    initiatedBy: initiatorActor,
    involvedParties: dedupeParticipants([
      { ...initiatorActor, roleInActivity: 'Initiator' },
      { ...trainerActor, roleInActivity: 'Designated Trainer' },
      ...attendeeActors.map(({ attendee, actor }) => ({
        ...actor,
        roleInActivity: `Attendee #${attendee.slNo}`
      }))
    ]),
    notifiedOnFinish: launchedImmediately && firstAttendee
      ? [`Attendee #1: ${formatActorInline(firstAttendee.actor)} (Email & In-App Invitation)`]
      : normalizeStringList(createLog?.details?.notifiedRecipients),
    nextAfterFinish: launchedImmediately && firstAttendee
      ? `Attendee #1: ${formatActorInline(firstAttendee.actor)} — Open register, review SOP document & provide digital signature`
      : `${initiatorActor.name} — Launch Signing Workflow to invite Attendee #1`,
    entityType: 'training_register',
    entityId,
    entityTitle,
    source: createLog ? 'audit_log' : 'record_state',
    summary: `Initiated "${register.trainingTitle}" (${register.modeOfTraining}) for ${register.attendees?.length || 0} attendee(s) with Trainer ${trainerActor.name}.`,
    changes: createLog?.changes,
    details: {
      ...(createLog?.details || {}),
      trainingTitle: register.trainingTitle,
      scheduledDate: register.date,
      timeWindow: `${register.startTime} - ${register.endTime}`,
      modeOfTraining: register.modeOfTraining,
      designatedTrainer: formatActorInline(trainerActor),
      sopDocument: `${register.documentTitle || register.trainingTitle} (${[register.documentCode || register.templateDocCode, formatQuestionnaireVersion(register.documentVersion || register.templateVersion)].filter(Boolean).join(' ')})`,
      mandatoryDocumentReview: register.requireDocumentReview !== false,
      totalAttendees: register.attendees?.length || 0,
      assessmentConducted: register.assessmentConducted
    }
  });

  // 2. Signing Workflow Started (if distinct from create)
  if (startWorkflowLog && !consumedLogIds.has(startWorkflowLog.id)) {
    consumedLogIds.add(startWorkflowLog.id);
    const startActor = resolveActorInfo(startWorkflowLog.userId, users, undefined, startWorkflowLog.userEmail);
    events.push({
      id: startWorkflowLog.id,
      stage: 'In Progress',
      when: startWorkflowLog.when || inferDefaultAuditWhen(startWorkflowLog.action, 'Training Registers', startWorkflowLog.details),
      timestamp: startWorkflowLog.timestamp,
      action: startWorkflowLog.action,
      why: startWorkflowLog.why || inferAuditReason(startWorkflowLog.action, 'Training Registers', startWorkflowLog.details),
      actor: startActor,
      initiatedBy: initiatorActor,
      involvedParties: dedupeParticipants([
        { ...startActor, roleInActivity: 'Workflow Launcher' },
        { ...trainerActor, roleInActivity: 'Designated Trainer' },
        ...(firstAttendee ? [{ ...firstAttendee.actor, roleInActivity: 'First Signer (Attendee #1)' }] : [])
      ]),
      notifiedOnFinish: firstAttendee
        ? [`Attendee #1: ${formatActorInline(firstAttendee.actor)} (Email & In-App Invitation)`]
        : [],
      nextAfterFinish: firstAttendee
        ? `Attendee #1: ${formatActorInline(firstAttendee.actor)} — Open register, confirm SOP document review & digitally sign`
        : 'Attendees — Begin signing sequence',
      entityType: 'training_register',
      entityId,
      entityTitle,
      source: 'audit_log',
      summary: `Sequential digital signing workflow launched by ${startActor.name}. Invited Attendee #1 (${firstAttendee?.actor.name || 'N/A'}).`,
      changes: startWorkflowLog.changes,
      details: startWorkflowLog.details || {}
    });
  } else if (register.workflowStatus !== 'draft' && !startWorkflowLog) {
    events.push({
      id: `reg-workflow-${entityId}`,
      stage: 'In Progress',
      when: inferDefaultAuditWhen('Started Signing Workflow', 'Training Registers'),
      timestamp: initiatedAt,
      action: 'Signing Workflow Initiated',
      why: inferAuditReason('Started Signing Workflow', 'Training Registers'),
      actor: initiatorActor,
      initiatedBy: initiatorActor,
      involvedParties: dedupeParticipants([
        { ...initiatorActor, roleInActivity: 'Workflow Launcher' },
        ...(firstAttendee ? [{ ...firstAttendee.actor, roleInActivity: 'First Signer (Attendee #1)' }] : [])
      ]),
      notifiedOnFinish: firstAttendee
        ? [`Attendee #1: ${formatActorInline(firstAttendee.actor)} (Email & In-App Invitation)`]
        : [],
      nextAfterFinish: firstAttendee
        ? `Attendee #1: ${formatActorInline(firstAttendee.actor)} — Open register, confirm SOP document review & digitally sign`
        : 'Attendees — Begin signing sequence',
      entityType: 'training_register',
      entityId,
      entityTitle,
      source: 'record_state',
      summary: `Sequential signing started for ${register.attendees?.length || 0} listed attendees.`,
      details: {
        firstSigner: register.attendees?.[0]?.traineeName || 'N/A',
        workflowStatus: register.workflowStatus
      }
    });
  }

  // 2b. Track Registered Open Access Proofs from register.openedBy + audit logs
  const openedAuditLogs = matchedLogs.filter((l) => l.action.toLowerCase().includes('opened training register'));
  for (const openLog of openedAuditLogs) {
    consumedLogIds.add(openLog.id);
    const openActor = resolveActorInfo(openLog.userId, users, undefined, openLog.userEmail);
    events.push({
      id: openLog.id,
      stage: 'In Progress',
      when: openLog.when || inferDefaultAuditWhen(openLog.action, 'Training Registers', openLog.details),
      timestamp: openLog.timestamp,
      action: openLog.action,
      why: openLog.why || inferAuditReason(openLog.action, 'Training Registers', openLog.details),
      actor: openActor,
      initiatedBy: initiatorActor,
      involvedParties: dedupeParticipants([
        { ...openActor, roleInActivity: `${openLog.details?.role || 'Participant'} (Opened Register)` },
        { ...trainerActor, roleInActivity: 'Designated Trainer' }
      ]),
      notifiedOnFinish: [],
      nextAfterFinish: `${formatActorInline(openActor)} — Review SOP material and proceed to signature`,
      entityType: 'training_register',
      entityId,
      entityTitle,
      source: 'audit_log',
      summary: `${openActor.name} opened and inspected the Training Register on screen.`,
      details: openLog.details || {}
    });
  }
  for (const openRec of register.openedBy || []) {
    const hasLogAlready = openedAuditLogs.some(
      (l) =>
        (openRec.uid && l.userId === openRec.uid) ||
        (openRec.email && l.userEmail?.toLowerCase().trim() === openRec.email.toLowerCase().trim())
    );
    if (!hasLogAlready) {
      const openActor = resolveActorInfo(openRec.uid || openRec.email, users, openRec.name, openRec.email);
      const roleLabel = openRec.role === 'trainer' ? 'Trainer' : openRec.role === 'trainee' ? 'Attendee' : 'Manager';
      events.push({
        id: `reg-open-${entityId}-${openRec.uid || openRec.email}`,
        stage: 'In Progress',
        when: inferDefaultAuditWhen('Opened Training Register', 'Training Registers'),
        timestamp: openRec.openedAt,
        action: 'Opened Training Register',
        why: inferAuditReason('Opened Training Register', 'Training Registers'),
        actor: openActor,
        initiatedBy: initiatorActor,
        involvedParties: dedupeParticipants([
          { ...openActor, roleInActivity: `${roleLabel} (Opened Register)` },
          { ...trainerActor, roleInActivity: 'Designated Trainer' }
        ]),
        notifiedOnFinish: [],
        nextAfterFinish: `${formatActorInline(openActor)} — Complete document review and sign register`,
        entityType: 'training_register',
        entityId,
        entityTitle,
        source: 'record_state',
        summary: `${openActor.name} opened the Training Register prior to signing.`,
        details: {
          role: roleLabel,
          openedAt: openRec.openedAt
        }
      });
    }
  }

  // 3. Attendee Document Reviews & Signatures
  for (let i = 0; i < attendeeActors.length; i++) {
    const { attendee, actor: attendeeActor } = attendeeActors[i];
    const nextAttendeeEntry = attendeeActors[i + 1];

    // Document review confirmation
    const docReviewLog = matchedLogs.find(
      (l) =>
        l.action.toLowerCase().includes('confirmed document review') &&
        ((attendee.email && l.userEmail?.toLowerCase().trim() === attendee.email.toLowerCase().trim()) ||
          (attendee.userId && l.userId === attendee.userId) ||
          (attendee.employeeId && l.userId === attendee.employeeId))
    );

    if (docReviewLog || (attendee.documentReviewed && attendee.documentReviewedAt)) {
      if (docReviewLog) consumedLogIds.add(docReviewLog.id);
      events.push({
        id: docReviewLog?.id || `doc-review-${entityId}-${attendee.slNo}`,
        stage: 'Review / Signature',
        when: docReviewLog?.when || inferDefaultAuditWhen('Confirmed Document Review', 'Training Registers', docReviewLog?.details),
        timestamp: attendee.documentReviewedAt || docReviewLog?.timestamp || '',
        action: `Attendee #${attendee.slNo} Confirmed Document Review`,
        why: docReviewLog?.why || inferAuditReason('Confirmed Document Review', 'Training Registers', docReviewLog?.details),
        actor: attendeeActor,
        initiatedBy: initiatorActor,
        involvedParties: dedupeParticipants([
          { ...attendeeActor, roleInActivity: `Attendee #${attendee.slNo} (Reviewer)` },
          { ...trainerActor, roleInActivity: 'Designated Trainer' }
        ]),
        notifiedOnFinish: [],
        nextAfterFinish: `${formatActorInline(attendeeActor)} — Digital signature unlocked (provide Attendee #${attendee.slNo} signature)`,
        entityType: 'training_register',
        entityId,
        entityTitle,
        source: docReviewLog ? 'audit_log' : 'record_state',
        summary: `${attendeeActor.name} reviewed & confirmed SOP/Training Material prior to signing.`,
        details: {
          attendeeSlNo: attendee.slNo,
          traineeName: attendeeActor.name,
          employeeId: attendeeActor.employeeId || attendee.employeeId || 'N/A',
          documentTitle: register.documentTitle || register.trainingTitle,
          documentCode: register.documentCode || register.templateDocCode,
          ...(formatQuestionnaireVersion(register.documentVersion || register.templateVersion)
            ? { documentVersion: formatQuestionnaireVersion(register.documentVersion || register.templateVersion) }
            : {})
        }
      });
    }

    // Attendee Signature
    const signLog = matchedLogs.find(
      (l) =>
        l.action.toLowerCase().includes('signed training register') &&
        (l.details?.slNo === attendee.slNo ||
          l.details?.attendee === attendee.traineeName ||
          (attendee.userId && l.userId === attendee.userId) ||
          (attendee.email && l.userEmail?.toLowerCase().trim() === attendee.email.toLowerCase().trim()))
    );

    if (signLog || attendee.status === 'signed' || attendee.signatureData) {
      if (signLog) consumedLogIds.add(signLog.id);
      const nextTargetLabel = nextAttendeeEntry
        ? `Attendee #${nextAttendeeEntry.attendee.slNo}: ${formatActorInline(nextAttendeeEntry.actor)}`
        : `Designated Trainer: ${formatActorInline(trainerActor)}`;

      const recordedNotified = normalizeStringList(signLog?.details?.notifiedRecipients);
      const signNotified =
        recordedNotified.length > 0
          ? recordedNotified
          : [`${nextTargetLabel} (Email & In-App Notification)`];

      events.push({
        id: signLog?.id || `sign-${entityId}-${attendee.slNo}`,
        stage: 'Review / Signature',
        when: signLog?.when || inferDefaultAuditWhen('Signed Training Register', 'Training Registers', signLog?.details),
        timestamp: attendee.signedAt || signLog?.timestamp || register.updatedAt,
        action: `Attendee #${attendee.slNo} Signed Register`,
        why: signLog?.why || inferAuditReason('Signed Training Register', 'Training Registers', signLog?.details),
        actor: attendeeActor,
        initiatedBy: initiatorActor,
        involvedParties: dedupeParticipants([
          { ...attendeeActor, roleInActivity: `Attendee #${attendee.slNo} (Signed)` },
          nextAttendeeEntry
            ? { ...nextAttendeeEntry.actor, roleInActivity: `Next Signer (Attendee #${nextAttendeeEntry.attendee.slNo})` }
            : { ...trainerActor, roleInActivity: 'Next Signer (Trainer)' }
        ]),
        notifiedOnFinish: signNotified,
        nextAfterFinish: nextAttendeeEntry
          ? `${nextTargetLabel} — Review SOP document & provide Attendee #${nextAttendeeEntry.attendee.slNo} signature`
          : `${nextTargetLabel} — Review SOP document & provide final Trainer sign-off`,
        entityType: 'training_register',
        entityId,
        entityTitle,
        source: signLog ? 'audit_log' : 'record_state',
        summary: `${attendeeActor.name} digitally signed attendance on ${attendee.signedDate || register.date}. Handed off to ${nextTargetLabel}.`,
        changes: signLog?.changes || [
          { field: `Attendee #${attendee.slNo} (${attendeeActor.name})`, from: 'pending', to: 'signed' }
        ],
        details: {
          attendeeSlNo: attendee.slNo,
          traineeName: attendeeActor.name,
          employeeId: attendeeActor.employeeId || attendee.employeeId || 'N/A',
          signedDate: attendee.signedDate || register.date,
          department: attendee.department || 'N/A',
          designation: attendee.designation || 'N/A'
        }
      });
    }
  }

  // 4. Trainer Document Review
  const trainerDocLog = matchedLogs.find(
    (l) =>
      l.action.toLowerCase().includes('confirmed document review') &&
      (l.details?.role === 'Trainer' ||
        (register.trainerEmail && l.userEmail?.toLowerCase().trim() === register.trainerEmail.toLowerCase().trim()) ||
        (register.trainerId && l.userId === register.trainerId))
  );
  if (trainerDocLog || (register.trainerDocumentReviewed && register.trainerDocumentReviewedAt)) {
    if (trainerDocLog) consumedLogIds.add(trainerDocLog.id);
    events.push({
      id: trainerDocLog?.id || `trainer-doc-${entityId}`,
      stage: 'Review / Signature',
      when: trainerDocLog?.when || inferDefaultAuditWhen('Confirmed Document Review', 'Training Registers', trainerDocLog?.details),
      timestamp: register.trainerDocumentReviewedAt || trainerDocLog?.timestamp || '',
      action: 'Trainer Confirmed Document Review',
      why: trainerDocLog?.why || inferAuditReason('Confirmed Document Review', 'Training Registers', trainerDocLog?.details),
      actor: trainerActor,
      initiatedBy: initiatorActor,
      involvedParties: dedupeParticipants([
        { ...trainerActor, roleInActivity: 'Designated Trainer' },
        { ...initiatorActor, roleInActivity: 'Initiator' }
      ]),
      notifiedOnFinish: [],
      nextAfterFinish: `Trainer: ${formatActorInline(trainerActor)} — Final closing signature unlocked`,
      entityType: 'training_register',
      entityId,
      entityTitle,
      source: trainerDocLog ? 'audit_log' : 'record_state',
      summary: `Designated Trainer ${trainerActor.name} confirmed SOP document review before final sign-off.`,
      details: {
        role: 'Trainer',
        documentTitle: register.documentTitle || register.trainingTitle,
        ...(formatQuestionnaireVersion(register.documentVersion || register.templateVersion)
          ? { documentVersion: formatQuestionnaireVersion(register.documentVersion || register.templateVersion) }
          : {})
      }
    });
  }

  // 5. Trainer Final Sign-off / Closing
  let closedBy: (ResolvedActor & { timestamp?: string }) | null = null;
  const closeNotifiedList: string[] = [];
  if (trainerCompleteLog || register.workflowStatus === 'completed' || register.trainerSignedAt) {
    if (trainerCompleteLog) consumedLogIds.add(trainerCompleteLog.id);
    const closedAt = register.trainerSignedAt || trainerCompleteLog?.timestamp || register.updatedAt;
    closedBy = { ...trainerActor, timestamp: closedAt };

    const recordedCloseNotified = normalizeStringList(trainerCompleteLog?.details?.notifiedRecipients);
    const computedCloseNotified =
      recordedCloseNotified.length > 0
        ? recordedCloseNotified
        : [
            ...(qaRecipients.length > 0
              ? qaRecipients.map((q) => `QA: ${formatActorInline(q)} (Completed Register Email)`)
              : ['Quality Assurance (QA) Team (Completed Register Email)']),
            ...(itRecipients.length > 0
              ? itRecipients.map((it) => `IT: ${formatActorInline(it)} (Completed Register Email)`)
              : ['IT Administration Team (Completed Register Email)'])
          ];
    closeNotifiedList.push(...computedCloseNotified);

    events.push({
      id: trainerCompleteLog?.id || `trainer-close-${entityId}`,
      stage: 'Closing',
      when: trainerCompleteLog?.when || inferDefaultAuditWhen('Completed Training Register', 'Training Registers', trainerCompleteLog?.details),
      timestamp: closedAt,
      action: trainerCompleteLog?.action || 'Completed Training Register (Trainer Sign-off & Closure)',
      why: trainerCompleteLog?.why || inferAuditReason('Completed Training Register', 'Training Registers', trainerCompleteLog?.details),
      actor: trainerActor,
      initiatedBy: initiatorActor,
      involvedParties: allInvolved,
      notifiedOnFinish: computedCloseNotified,
      nextAfterFinish: 'Quality Assurance (QA) & IT Administration — Completed Register archived & compliance verified',
      entityType: 'training_register',
      entityId,
      entityTitle,
      source: trainerCompleteLog ? 'audit_log' : 'record_state',
      summary: `Training Register closed & verified by Trainer ${trainerActor.name} on ${register.trainerSignedDate || register.date}. QA & IT teams notified.`,
      changes: trainerCompleteLog?.changes || [
        { field: 'Workflow Status', from: 'awaiting_trainer', to: 'completed' }
      ],
      details: {
        ...(trainerCompleteLog?.details || {}),
        trainerName: trainerActor.name,
        trainerEmail: trainerActor.email,
        signedDate: register.trainerSignedDate || register.date,
        workflowStatus: 'completed'
      }
    });
  }

  // 6. Merge remaining auditLogs (edits with field diffs, PDF downloads, etc.)
  for (const log of matchedLogs) {
    if (consumedLogIds.has(log.id)) continue;
    const enriched = enrichAuditLogEntry(log, users, {
      registers: [register],
      templateConfig
    });
    events.push({
      id: log.id,
      stage: enriched.stage,
      when: enriched.when,
      timestamp: log.timestamp,
      action: log.action,
      why: enriched.why,
      actor: enriched.actor,
      initiatedBy: enriched.initiatedBy || initiatorActor,
      involvedParties: enriched.involvedParties,
      notifiedOnFinish: enriched.notifiedOnFinish,
      nextAfterFinish: enriched.nextAfterFinish || 'No workflow handoff (Audit Record)',
      entityType: 'training_register',
      entityId,
      entityTitle,
      source: 'audit_log',
      summary: `${log.action} performed by ${enriched.actor.name}${enriched.actor.email ? ` (${enriched.actor.email})` : ''}.`,
      changes: log.changes,
      details: log.details || {}
    });
  }

  const totalAttendees = register.attendees?.length || 0;
  const signedCount = (register.attendees || []).filter((a) => a.status === 'signed' || Boolean(a.signatureData)).length;
  const reviewedCount = (register.attendees || []).filter((a) => Boolean(a.documentReviewed)).length;

  const statusMap: Record<string, string> = {
    draft: 'Draft (Not Launched)',
    in_progress: `In Progress (${signedCount}/${totalAttendees} Attendees Signed)`,
    awaiting_trainer: 'All Attendees Signed — Awaiting Trainer Closing',
    completed: 'Completed & Closed'
  };

  const pendingAttendee = attendeeActors.find(({ attendee }) => attendee.status === 'pending');
  const nextStepSummary =
    register.workflowStatus === 'completed'
      ? 'Register closed & verified — QA and IT teams notified.'
      : register.workflowStatus === 'awaiting_trainer'
      ? `Next: Designated Trainer (${formatActorInline(trainerActor)}) to complete final sign-off.`
      : pendingAttendee
      ? `Next: Attendee #${pendingAttendee.attendee.slNo} (${formatActorInline(pendingAttendee.actor)}) to review SOP & sign.`
      : `Next: ${initiatorActor.name} to launch signing workflow.`;

  return {
    entityType: 'training_register',
    entityId,
    entityTitle,
    currentStatus: statusMap[register.workflowStatus] || register.workflowStatus,
    isClosed: register.workflowStatus === 'completed',
    initiatedBy: { ...initiatorActor, timestamp: initiatedAt },
    assignedOwner: trainerActor,
    closedBy,
    allInvolvedParties: allInvolved,
    notificationsSummary:
      closeNotifiedList.length > 0
        ? closeNotifiedList
        : sortEventsAsc(events)[sortEventsAsc(events).length - 1]?.notifiedOnFinish || [],
    nextStepSummary,
    metrics: [
      { label: 'Attendee Signatures', value: `${signedCount} / ${totalAttendees}` },
      { label: 'Document Reviews', value: `${reviewedCount} / ${totalAttendees}` },
      { label: 'Trainer Doc Review', value: register.trainerDocumentReviewed ? 'Confirmed' : 'Pending' },
      { label: 'Register Status', value: register.workflowStatus.replace(/_/g, ' ').toUpperCase() }
    ],
    events: sortEventsAsc(events)
  };
}

export function buildTemplateLifecycle(params: {
  template: Template;
  users: User[];
  logs: AuditLog[];
}): LifecycleReportSummary {
  const { template, users, logs } = params;
  const entityId = template.id;
  const ver = formatQuestionnaireVersion(template.version);
  const entityTitle = `${template.name || 'Questionnaire Template'}${ver ? ` (${ver})` : ''}`;

  const matchedLogs = logs.filter(
    (l) =>
      l.entityId === entityId ||
      l.details?.templateId === entityId ||
      l.details?.id === entityId
  );

  const createLog = matchedLogs.find((l) => l.action.toLowerCase().includes('create'));
  const initiatorActor = resolveActorInfo(
    template.createdBy || createLog?.userId,
    users,
    createLog?.details?.initiatedByName,
    createLog?.userEmail
  );

  const events: LifecycleTimelineEvent[] = [];
  const consumed = new Set<string>();

  if (createLog) {
    consumed.add(createLog.id);
    events.push({
      id: createLog.id,
      stage: 'Initiation',
      when: createLog.when || inferDefaultAuditWhen(createLog.action, 'Templates', createLog.details),
      timestamp: createLog.timestamp || template.createdAt,
      action: createLog.action,
      why: createLog.why || inferAuditReason(createLog.action, 'Templates', createLog.details),
      actor: resolveActorInfo(createLog.userId, users, undefined, createLog.userEmail),
      initiatedBy: initiatorActor,
      involvedParties: [{ ...initiatorActor, roleInActivity: 'Template Author' }],
      notifiedOnFinish: [],
      nextAfterFinish: 'Ready for assessment assignment & version control',
      entityType: 'template',
      entityId,
      entityTitle,
      source: 'audit_log',
      summary: `Created questionnaire template "${template.name}"${ver ? ` (${ver})` : ''}.`,
      changes: createLog.changes,
      details: createLog.details || {}
    });
  } else {
    events.push({
      id: `tmpl-init-${entityId}`,
      stage: 'Initiation',
      when: inferDefaultAuditWhen('Created Questionnaire Template', 'Templates'),
      timestamp: template.createdAt || template.updatedAt,
      action: 'Created Questionnaire Template',
      why: inferAuditReason('Created Questionnaire Template', 'Templates'),
      actor: initiatorActor,
      initiatedBy: initiatorActor,
      involvedParties: [{ ...initiatorActor, roleInActivity: 'Template Author' }],
      notifiedOnFinish: [],
      nextAfterFinish: 'Ready for assessment assignment & version control',
      entityType: 'template',
      entityId,
      entityTitle,
      source: 'record_state',
      summary: `Created questionnaire template "${template.name}"${ver ? ` (${ver})` : ''}.`,
      details: {
        documentCode: template.documentCode || 'N/A',
        ...(ver ? { version: ver } : {}),
        questionCount: template.questions?.length || 0,
        status: template.status
      }
    });
  }

  for (const log of matchedLogs) {
    if (consumed.has(log.id)) continue;
    const enriched = enrichAuditLogEntry(log, users, { templates: [template] });
    events.push({
      id: log.id,
      stage: enriched.stage,
      when: enriched.when,
      timestamp: log.timestamp,
      action: log.action,
      why: enriched.why,
      actor: enriched.actor,
      initiatedBy: enriched.initiatedBy || initiatorActor,
      involvedParties: enriched.involvedParties,
      notifiedOnFinish: enriched.notifiedOnFinish,
      nextAfterFinish: enriched.nextAfterFinish || 'Template record updated',
      entityType: 'template',
      entityId,
      entityTitle,
      source: 'audit_log',
      summary: `${log.action} performed by ${enriched.actor.name}${enriched.actor.email ? ` (${enriched.actor.email})` : ''}.`,
      changes: log.changes,
      details: log.details || {}
    });
  }

  const sortedEvents = sortEventsAsc(events);
  const latestEvent = sortedEvents[sortedEvents.length - 1];
  const allParties = dedupeParticipants(sortedEvents.flatMap((e) => e.involvedParties));

  return {
    entityType: 'template',
    entityId,
    entityTitle,
    currentStatus: (template.status || 'active').toUpperCase(),
    isClosed: template.status === 'inactive',
    initiatedBy: { ...initiatorActor, timestamp: template.createdAt || sortedEvents[0]?.timestamp },
    closedBy: latestEvent ? { ...latestEvent.actor, timestamp: latestEvent.timestamp } : null,
    allInvolvedParties: allParties,
    notificationsSummary: [],
    nextStepSummary:
      template.status === 'active'
        ? 'Active template — available for assessment assignments and training evaluations.'
        : `Template status: ${template.status}`,
    metrics: [
      { label: 'Template Code', value: template.documentCode || 'N/A' },
      { label: 'Version', value: ver || '—' },
      { label: 'Questions', value: String(template.questions?.length || 0) },
      { label: 'Pass Mark', value: `${template.passMark ?? 80}%` }
    ],
    events: sortedEvents
  };
}

export function buildGenericEntityLifecycle(params: {
  entityType: AuditEntityCategory;
  entityId: string;
  entityTitle?: string;
  logs: AuditLog[];
  users: User[];
  context?: AuditEnrichmentContext;
}): LifecycleReportSummary {
  const { entityType, entityId, entityTitle, logs, users, context } = params;
  const matched = logs.filter(
    (l) =>
      l.entityId === entityId ||
      l.details?.id === entityId ||
      l.details?.submissionId === entityId ||
      l.details?.assignmentId === entityId ||
      l.details?.registerId === entityId ||
      l.details?.templateId === entityId
  );

  const enrichedEvents: LifecycleTimelineEvent[] = sortEventsAsc(
    matched.map((log) => {
      const enriched = enrichAuditLogEntry(log, users, context);
      return {
        id: log.id,
        stage: enriched.stage,
        when: enriched.when,
        timestamp: log.timestamp,
        action: log.action,
        why: enriched.why,
        actor: enriched.actor,
        initiatedBy: enriched.initiatedBy,
        involvedParties: enriched.involvedParties,
        notifiedOnFinish: enriched.notifiedOnFinish,
        nextAfterFinish: enriched.nextAfterFinish || 'Audit event recorded',
        entityType: enriched.resolvedEntityType,
        entityId,
        entityTitle: entityTitle || log.entityTitle || entityId,
        source: 'audit_log',
        summary: `${log.action} performed by ${enriched.actor.name}${enriched.actor.email ? ` (${enriched.actor.email})` : ''}.`,
        changes: log.changes,
        details: log.details || {}
      };
    })
  );

  const first = enrichedEvents[0];
  const last = enrichedEvents[enrichedEvents.length - 1];
  const initiator = first?.initiatedBy || first?.actor || { name: 'System', email: '' };

  return {
    entityType,
    entityId,
    entityTitle: entityTitle || first?.entityTitle || entityId,
    currentStatus: `${enrichedEvents.length} Recorded Activit${enrichedEvents.length === 1 ? 'y' : 'ies'}`,
    isClosed: Boolean(last && last.stage === 'Closing'),
    initiatedBy: { ...initiator, timestamp: first?.timestamp },
    closedBy: last ? { ...last.actor, timestamp: last.timestamp } : null,
    allInvolvedParties: dedupeParticipants(enrichedEvents.flatMap((e) => e.involvedParties)),
    notificationsSummary: last?.notifiedOnFinish || [],
    nextStepSummary: last?.nextAfterFinish || 'All logged activities displayed.',
    events: enrichedEvents
  };
}

