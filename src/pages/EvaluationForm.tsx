import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { 
  Save, 
  ArrowLeft, 
  CheckCircle2, 
  XCircle, 
  RotateCcw, 
  MessageSquare, 
  Award,
  Loader2,
  ChevronRight,
  Info,
  Download,
  FileText,
  ShieldAlert
} from 'lucide-react';
import { firestoreService } from '../services/firestoreService';
import { trainingRegisterService } from '../services/trainingRegisterService';
import { Submission, Template, Evaluation, User, Question, Assignment, Department } from '../types';
import { cn, formatDateTime, formatId } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { sanitizeReportBrandName } from '../utils/pdfBranding';

export default function EvaluationForm() {
  const { submissionId } = useParams();
  const navigate = useNavigate();
  const { user: reviewer, isAdmin, isHR, isQM, branding, hasPermission } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [employee, setEmployee] = useState<User | null>(null);
  const [assignedReviewerUser, setAssignedReviewerUser] = useState<User | null>(null);
  const [allUsersList, setAllUsersList] = useState<User[]>([]);
  const [assignedReviewerName, setAssignedReviewerName] = useState<string>('');
  const [canEvaluate, setCanEvaluate] = useState<boolean>(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isReadOnly, setIsReadOnly] = useState(false);
  
  const [evaluation, setEvaluation] = useState<Partial<Evaluation>>({
    questionScores: {},
    questionComments: {},
    overallComments: '',
    strengths: '',
    improvements: '',
    result: 'pass',
    retestRequired: false
  });

  const reviewerRoles = reviewer?.roles && reviewer.roles.length > 0
    ? reviewer.roles
    : (reviewer?.role ? [reviewer.role] : []);

  const hasAdminOrQualityRole = 
    isAdmin || 
    isHR || 
    isQM || 
    reviewerRoles.some(r => ['super_admin', 'hr_admin', 'quality_management'].includes(r as any));

  useEffect(() => {
    const loadData = async () => {
      if (!submissionId || !reviewer) {
        setLoading(false);
        return;
      }

      const sub = await firestoreService.getDocument<Submission>('submissions', submissionId);
      if (sub) {
        setSubmission(sub);

        const assign = await firestoreService.getDocument<Assignment>('assignments', sub.assignmentId);
        if (!assign) {
          setAccessDenied(true);
          setLoading(false);
          return;
        }
        setAssignment(assign);

        const [temp, emp, existingEval, depts, allUsers] = await Promise.all([
          firestoreService.getDocument<Template>('templates', assign.templateId),
          firestoreService.getDocument<User>('users', sub.employeeId),
          firestoreService.getCollection<Evaluation>('reviews', []),
          firestoreService.getCollection<Department>('departments'),
          firestoreService.getCollection<User>('users', [])
        ]);

        setAllUsersList(allUsers);
        const revUser = allUsers.find(u => u.uid === assign.reviewerId || u.email === assign.reviewerId || u.id === assign.reviewerId) || null;
        setAssignedReviewerUser(revUser);
        const revDisplayName = revUser?.displayName || assign.reviewerId || 'Not specified';
        setAssignedReviewerName(revDisplayName);

        // Strictly ONLY the assigned Assessor can perform & submit this evaluation
        const isAssigned = Boolean(
          reviewer &&
          assign.reviewerId &&
          (
            assign.reviewerId === reviewer.uid ||
            assign.reviewerId === reviewer.email ||
            assign.reviewerId === reviewer.id
          )
        );

        const canViewSubmission = isAssigned || hasAdminOrQualityRole || hasPermission('evaluate_submissions') || hasPermission('view_reports');
        if (!canViewSubmission) {
          setAccessDenied(true);
          setLoading(false);
          return;
        }

        // Log viewing activity with report-wise metadata
        await firestoreService.logActivity(
          'Viewed Evaluation Form',
          'Reviews',
          {
            submissionId,
            assignmentId: assign.id,
            employeeName: emp?.displayName,
            templateName: temp?.name,
            assignedAssessor: revDisplayName
          },
          reviewer.uid,
          reviewer.email,
          {
            entityType: 'assessment_report',
            entityId: submissionId,
            entityTitle: temp?.name || 'Assessment Report'
          }
        );

        setCanEvaluate(isAssigned);

        if (sub.status === 'completed' || !isAssigned) {
          setIsReadOnly(true);
        }
        
        setDepartments(depts);
        
        if (temp && assign.selectedQuestionIds && assign.selectedQuestionIds.length > 0) {
          temp.questions = temp.questions.filter(q => assign.selectedQuestionIds?.includes(q.id));
        }
        
        setTemplate(temp);
        setEmployee(emp);
        
        const myEval = existingEval.find(e => e.submissionId === submissionId);
        if (myEval) setEvaluation(myEval);
      }
      setLoading(false);
    };
    loadData();
  }, [submissionId, reviewer]);

  const handleScoreChange = (qId: string, isCorrect: boolean) => {
    if (isReadOnly || !canEvaluate) return;
    setEvaluation(prev => {
      const newScores = { ...prev.questionScores, [qId]: isCorrect ? 1 : 0 };
      const correctCount = Object.values(newScores).filter(v => v === 1).length;
      const totalQuestions = template?.questions.length || 1;
      const percentage = (correctCount / totalQuestions) * 100;
      
      const passThreshold = 80;
      // Force one decimal place for the comparison as well
      const fixedPercentage = parseFloat(percentage.toFixed(1));
      const result = fixedPercentage >= passThreshold ? 'pass' : 'fail';
      
      return {
        ...prev,
        questionScores: newScores,
        result,
        retestRequired: result === 'fail' // Automatically set retest if failed
      };
    });
  };

  const calculateCorrectCount = () => {
    const scores = evaluation.questionScores || {};
    return Object.values(scores).filter(v => v === 1).length;
  };

  const calculatePercentage = () => {
    const correctCount = calculateCorrectCount();
    const totalQuestions = template?.questions.length || 1;
    return (correctCount / totalQuestions) * 100;
  };

  const handleSubmit = async () => {
    const isStrictlyAssigned = Boolean(
      reviewer &&
      assignment?.reviewerId &&
      (
        assignment.reviewerId === reviewer.uid ||
        assignment.reviewerId === reviewer.email ||
        assignment.reviewerId === reviewer.id
      )
    );

    if (!canEvaluate || !isStrictlyAssigned) {
      toast.error(`Unauthorized: Only the assigned Assessor (${assignedReviewerName}) can perform and submit this evaluation.`);
      return;
    }

    if (submission?.status === 'completed') {
      toast.info('This evaluation has already been completed.');
      return;
    }

    setSubmitting(true);
    try {
      const finalScore = calculatePercentage();
      const reviewedAt = new Date().toISOString();
      const data = {
        ...evaluation,
        submissionId,
        reviewerId: reviewer?.uid,
        finalScore,
        reviewedAt
      };

      await Promise.all([
        firestoreService.createDocument('reviews', data),
        firestoreService.updateDocument('submissions', submissionId!, { status: 'completed' }),
        firestoreService.logActivity(
          'Completed Evaluation',
          'Reviews',
          { 
            submissionId,
            assignmentId: assignment?.id,
            employeeName: employee?.displayName,
            templateName: template?.name,
            templateVersion: template?.version || 'V1.0',
            score: finalScore,
            result: evaluation.result,
            retestRequired: Boolean(evaluation.retestRequired),
            assessor: reviewer?.displayName || reviewer?.email
          },
          reviewer?.uid,
          reviewer?.email,
          {
            entityType: 'assessment_report',
            entityId: submissionId,
            entityTitle: `${template?.name || 'Assessment'} — ${employee?.displayName || 'Trainee'}`,
            changes: [
              { field: 'status', from: submission?.status || 'submitted', to: 'completed' },
              { field: 'finalScore', from: null, to: `${finalScore.toFixed(1)}%` },
              { field: 'result', from: null, to: (evaluation.result || 'fail').toUpperCase() },
              { field: 'retestRequired', from: null, to: Boolean(evaluation.retestRequired) }
            ]
          }
        )
      ]);

      // Notify Trainee, Assessor, and QA upon evaluation completion
      const orgName = sanitizeReportBrandName(branding?.companyName) || 'Quality & Training Management';
      const resultLabel = (evaluation.result || 'fail').toUpperCase();
      const resultBadgeBg = evaluation.result === 'pass' ? '#f0fdf4' : '#fef2f2';
      const resultBadgeBorder = evaluation.result === 'pass' ? '#bbf7d0' : '#fecaca';
      const resultColor = evaluation.result === 'pass' ? '#16a34a' : '#dc2626';

      const dispatchEmail = async (to: string, subject: string, html: string) => {
        const emailData = { to, subject, html };
        try {
          await firestoreService.createDocument('mail', {
            ...emailData,
            status: 'pending',
            sentAt: null
          });
          await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(emailData),
          });
        } catch (err) {
          console.error(`Failed to trigger email notification to ${to}:`, err);
        }
      };

      const dispatchInAppNotification = async (
        userId: string,
        title: string,
        message: string,
        type: 'success' | 'warning' | 'info',
        link: string
      ) => {
        if (!userId) return;
        try {
          await firestoreService.createDocument('notifications', {
            userId,
            title,
            message,
            type,
            link,
            read: false,
            createdAt: new Date().toISOString()
          });
        } catch (err) {
          console.error(`Failed to create notification for ${userId}:`, err);
        }
      };

      const buildCompletionEmailHtml = (recipientName: string, introText: string, ctaLabel: string, ctaPath: string) => `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 14px;">
            <h1 style="color: #0f172a; margin: 0; font-size: 20px;">${orgName}</h1>
            <p style="color: #64748b; margin: 5px 0 0 0; font-size: 13px;">Training &amp; Assessment Completion Notification</p>
          </div>
          <h2 style="color: #0f172a; margin-top: 0; font-size: 18px;">Assessment Evaluation Completed</h2>
          <p>Hello <strong>${recipientName}</strong>,</p>
          <p>${introText}</p>
          <div style="background-color: ${resultBadgeBg}; padding: 18px; border-radius: 12px; margin: 20px 0; border: 1px solid ${resultBadgeBorder};">
            <p style="margin: 0; color: #334155;"><strong>Trainee:</strong> ${employee?.displayName || employee?.email || 'N/A'} ${employee?.employeeId ? `(${employee.employeeId})` : ''}</p>
            <p style="margin: 8px 0 0 0; color: #334155;"><strong>Assessor:</strong> ${assignedReviewerName}</p>
            <p style="margin: 8px 0 0 0; color: #334155;"><strong>Assessment:</strong> ${template?.name || 'N/A'} (${template?.version || 'V1.0'})</p>
            <p style="margin: 8px 0 0 0; color: #334155;"><strong>Result:</strong> <span style="color: ${resultColor}; font-weight: bold;">${resultLabel}</span></p>
            <p style="margin: 8px 0 0 0; color: #334155;"><strong>Score:</strong> ${finalScore.toFixed(1)}%</p>
            <p style="margin: 8px 0 0 0; color: #334155;"><strong>Re-assessment Required:</strong> ${evaluation.retestRequired ? 'Yes' : 'No'}</p>
          </div>
          <div style="background-color: #f8fafc; padding: 16px; border-radius: 12px; margin: 20px 0; border: 1px solid #f1f5f9;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; color: #0f172a;">Assessor Comments:</h3>
            <p style="margin: 0; color: #475569; font-style: italic;">"${evaluation.overallComments || 'No overall comments provided.'}"</p>
          </div>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${window.location.origin}${ctaPath}" style="display: inline-block; background-color: #0f172a; color: white; padding: 12px 28px; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 14px;">${ctaLabel}</a>
          </div>
          <div style="margin-top: 30px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center;">
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">Automated notification from ${orgName}. Please do not reply to this email.</p>
          </div>
        </div>
      `;

      // 1. Notify Trainee
      if (employee?.uid) {
        await dispatchInAppNotification(
          employee.uid,
          `Evaluation Completed: ${template?.name}`,
          `Your assessment was evaluated by ${assignedReviewerName}. Result: ${resultLabel} (${finalScore.toFixed(1)}%).`,
          evaluation.result === 'pass' ? 'success' : 'warning',
          '/my-assessments'
        );
      }
      if (employee?.email) {
        await dispatchEmail(
          employee.email,
          `Assessment Result: ${template?.name} (${resultLabel})`,
          buildCompletionEmailHtml(
            employee.displayName || employee.email,
            `Your assessment <strong>${template?.name}</strong> has been evaluated by <strong>${assignedReviewerName}</strong>.`,
            'View My Result',
            '/my-assessments'
          )
        );
      }

      // 2. Notify Assessor
      const assessorUid = assignedReviewerUser?.uid || reviewer?.uid;
      const assessorEmail = assignedReviewerUser?.email || reviewer?.email;
      if (assessorUid) {
        await dispatchInAppNotification(
          assessorUid,
          `Evaluation Submitted: ${employee?.displayName || 'Trainee'}`,
          `You completed the evaluation for ${template?.name}. Result: ${resultLabel} (${finalScore.toFixed(1)}%).`,
          'info',
          `/evaluate/${submissionId}`
        );
      }
      if (assessorEmail) {
        await dispatchEmail(
          assessorEmail,
          `Evaluation Recorded: ${template?.name} - ${employee?.displayName || 'Trainee'}`,
          buildCompletionEmailHtml(
            assignedReviewerName,
            `Your evaluation for <strong>${employee?.displayName || 'the trainee'}</strong> on <strong>${template?.name}</strong> has been finalized and shared with QA and the trainee.`,
            'View Evaluation',
            `/evaluate/${submissionId}`
          )
        );
      }

      // 3. Notify QA (All active Quality Management users + configured qualityTeamEmails)
      const qaUsers = allUsersList.filter(u => {
        if (u.status === 'inactive') return false;
        const uRoles = u.roles && u.roles.length > 0 ? u.roles : (u.role ? [u.role] : []);
        return uRoles.includes('quality_management');
      });

      let configuredQaEmails: string[] = [];
      try {
        const regConfig = await trainingRegisterService.getTemplateConfig();
        configuredQaEmails = regConfig.qualityTeamEmails || [];
      } catch (cfgErr) {
        console.warn('Could not load QA team emails config:', cfgErr);
      }

      const notifiedQaUids = new Set<string>();
      for (const qaUser of qaUsers) {
        if (qaUser.uid && !notifiedQaUids.has(qaUser.uid)) {
          notifiedQaUids.add(qaUser.uid);
          await dispatchInAppNotification(
            qaUser.uid,
            `QA Notice — Evaluation Completed: ${template?.name}`,
            `${employee?.displayName || 'Trainee'} evaluated by ${assignedReviewerName}. Result: ${resultLabel} (${finalScore.toFixed(1)}%).`,
            evaluation.result === 'pass' ? 'success' : 'warning',
            '/reports'
          );
        }
      }

      const uniqueQaEmails = Array.from(
        new Set([
          ...qaUsers.map(u => u.email).filter(Boolean),
          ...configuredQaEmails.filter(Boolean)
        ].map(e => e.trim().toLowerCase()))
      );

      for (const qaEmail of uniqueQaEmails) {
        const matchedQaUser = qaUsers.find(u => u.email?.toLowerCase() === qaEmail);
        await dispatchEmail(
          qaEmail,
          `QA Notification — Assessment Completed: ${template?.name} (${employee?.displayName || 'Trainee'})`,
          buildCompletionEmailHtml(
            matchedQaUser?.displayName || 'Quality Assurance Team',
            `An assessment evaluation has been completed by Assessor <strong>${assignedReviewerName}</strong> for <strong>${employee?.displayName || 'the trainee'}</strong>.`,
            'Open Assessment Reports',
            '/reports'
          )
        );
      }

      toast.success('Evaluation completed! Notifications sent to QA, Assessor, and Trainee.');
      navigate('/submissions');
    } catch (error) {
      console.error(error);
      toast.error('Failed to submit evaluation.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-screen">Loading evaluation...</div>;

  if (accessDenied) {
    return (
      <div className="max-w-lg mx-auto mt-16 p-8 bg-card border rounded-2xl shadow-sm text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold">Unauthorized Access</h2>
        <p className="text-sm text-muted-foreground">
          You do not have permission to view or evaluate this submission.
        </p>
        <button
          onClick={() => navigate('/submissions')}
          className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90"
        >
          Back to Submissions
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      <div className="flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur-sm py-4 z-10 border-b">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/submissions')} className="p-2 hover:bg-accent rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">Evaluation: {employee?.displayName}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{template?.name}</span>
              <span>•</span>
              <span>Submitted {formatDateTime(submission?.submittedAt || '')}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-xs font-bold uppercase text-muted-foreground">Current Score</p>
            <p className="text-2xl font-black text-primary">{calculatePercentage().toFixed(1)}%</p>
            <p className="text-[10px] text-muted-foreground">({calculateCorrectCount()} / {template?.questions.length} Questions Correct)</p>
          </div>
          <button 
            onClick={handleSubmit}
            disabled={submitting || isReadOnly || !canEvaluate}
            className="flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground rounded-2xl font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-all disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            <span>
              {submission?.status === 'completed' 
                ? 'Review Completed' 
                : !canEvaluate 
                  ? 'Evaluation Restricted' 
                  : 'Submit Review'}
            </span>
          </button>
        </div>
      </div>

      {!canEvaluate && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start sm:items-center gap-3 text-amber-900 shadow-sm">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
          <div className="text-sm">
            <p className="font-bold">Evaluation Restricted — Assigned Assessor Only</p>
            <p className="text-xs text-amber-800">
              This assessment is assigned to Assessor <strong>{assignedReviewerName}</strong>. Only the assigned Assessor is permitted to score and submit this evaluation. You are currently in read-only view mode.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Questions & Answers */}
        <div className="lg:col-span-2 space-y-6">
          {template?.questions.map((q, i) => (
            <div key={q.id} className="bg-card rounded-2xl border shadow-sm overflow-hidden">
              <div className="p-4 bg-muted/30 border-b flex items-center justify-between">
                <span className="text-sm font-bold text-muted-foreground">Question {i + 1}</span>
                <span className="text-xs font-medium bg-accent px-2 py-0.5 rounded-full capitalize">{q.type.replace('_', ' ')}</span>
              </div>
              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <h4 className="text-lg font-semibold leading-tight">{q.text}</h4>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-xs font-bold uppercase text-muted-foreground mb-2">Employee Answer:</p>
                    {q.type === 'file_upload' ? (
                      submission?.answers[q.id] ? (
                        <div className="flex items-center justify-between p-3 bg-white border rounded-xl">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                              <FileText className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-sm font-bold truncate max-w-[200px]">{submission.answers[q.id].name}</p>
                              <p className="text-[10px] text-muted-foreground uppercase font-bold">Uploaded File</p>
                            </div>
                          </div>
                          <a 
                            href={submission.answers[q.id].data} 
                            download={submission.answers[q.id].name}
                            className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground rounded-lg text-xs font-bold hover:bg-accent/80 transition-all"
                          >
                            <Download className="w-4 h-4" />
                            Download
                          </a>
                        </div>
                      ) : (
                        <span className="text-rose-400 italic">No file uploaded</span>
                      )
                    ) : (
                      <p className="text-sm font-medium">{submission?.answers[q.id] || <span className="text-rose-400 italic">No answer provided</span>}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-6 pt-4 border-t">
                  <div className="flex-1 space-y-2">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Evaluation</label>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => !isReadOnly && handleScoreChange(q.id, true)}
                        disabled={isReadOnly}
                        className={cn(
                          "flex-1 py-2 rounded-xl border-2 font-bold transition-all flex items-center justify-center gap-2 text-sm",
                          evaluation.questionScores?.[q.id] === 1 
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700" 
                            : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted",
                          isReadOnly && "cursor-not-allowed"
                        )}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Right
                      </button>
                      <button 
                        onClick={() => !isReadOnly && handleScoreChange(q.id, false)}
                        disabled={isReadOnly}
                        className={cn(
                          "flex-1 py-2 rounded-xl border-2 font-bold transition-all flex items-center justify-center gap-2 text-sm",
                          evaluation.questionScores?.[q.id] === 0 && evaluation.questionScores?.hasOwnProperty(q.id)
                            ? "border-rose-500 bg-rose-50 text-rose-700" 
                            : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted",
                          isReadOnly && "cursor-not-allowed"
                        )}
                      >
                        <XCircle className="w-4 h-4" />
                        Wrong
                      </button>
                    </div>
                  </div>
                  <div className="flex-[2] space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Question Comments</label>
                    <input 
                      type="text" 
                      value={evaluation.questionComments?.[q.id] || ''}
                      readOnly={isReadOnly}
                      onChange={(e) => setEvaluation(prev => ({
                        ...prev,
                        questionComments: { ...prev.questionComments, [q.id]: e.target.value }
                      }))}
                      placeholder={isReadOnly ? "No comments" : "Add specific feedback..."}
                      className={cn(
                        "w-full px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20",
                        isReadOnly && "bg-muted cursor-not-allowed"
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary & Result */}
        <div className="space-y-6">
          <div className="bg-card p-6 rounded-2xl border shadow-sm space-y-6 sticky top-24">
            <h3 className="font-bold border-b pb-2 flex items-center gap-2">
              <Award className="w-4 h-4 text-primary" />
              Final Evaluation
            </h3>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted-foreground flex justify-between">
                  <span>Overall Result</span>
                  <span className="text-[10px] font-normal text-primary lowercase italic">(Auto-calculated)</span>
                </label>
                <div className="flex gap-2">
                  <div 
                    className={cn(
                      "flex-1 py-3 rounded-xl border-2 font-bold transition-all flex items-center justify-center gap-2",
                      evaluation.result === 'pass' ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-transparent bg-muted/20 text-muted-foreground opacity-30"
                    )}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Pass
                  </div>
                  <div 
                    className={cn(
                      "flex-1 py-3 rounded-xl border-2 font-bold transition-all flex items-center justify-center gap-2",
                      evaluation.result === 'fail' ? "border-rose-500 bg-rose-50 text-rose-700" : "border-transparent bg-muted/20 text-muted-foreground opacity-30"
                    )}
                  >
                    <XCircle className="w-4 h-4" />
                    Fail
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted-foreground flex justify-between">
                  <span>Re-assessment Required?</span>
                  <span className="text-[10px] font-normal text-primary lowercase italic">(Auto-calculated)</span>
                </label>
                <div 
                  className={cn(
                    "w-full py-3 rounded-xl border-2 font-bold flex items-center justify-center gap-2 transition-all",
                    evaluation.retestRequired 
                      ? "border-amber-500 bg-amber-50 text-amber-700" 
                      : "border-emerald-500 bg-emerald-50 text-emerald-700"
                  )}
                >
                  {evaluation.retestRequired ? <RotateCcw className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  {evaluation.retestRequired ? 'Re-assessment Required' : 'No Re-assessment Needed'}
                </div>
                <div className="p-3 bg-muted/30 rounded-lg border border-dashed text-[10px] text-muted-foreground font-medium leading-relaxed">
                  <p className="flex items-center gap-1.5 mb-1 text-primary">
                    <Info className="w-3 h-3" />
                    <span>Evaluation Rule:</span>
                  </p>
                  <p>• Pass (≥80.0%): Re-assessment is automatically disabled.</p>
                  <p>• Fail (&lt;80.0%): Re-assessment is automatically enabled.</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted-foreground">Strengths</label>
                <textarea 
                  value={evaluation.strengths}
                  readOnly={isReadOnly}
                  onChange={e => setEvaluation({...evaluation, strengths: e.target.value})}
                  className={cn(
                    "w-full px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 min-h-[80px] text-sm",
                    isReadOnly && "bg-muted cursor-not-allowed"
                  )}
                  placeholder={isReadOnly ? "" : "What did the employee do well?"}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted-foreground">Areas for Improvement</label>
                <textarea 
                  value={evaluation.improvements}
                  readOnly={isReadOnly}
                  onChange={e => setEvaluation({...evaluation, improvements: e.target.value})}
                  className={cn(
                    "w-full px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 min-h-[80px] text-sm",
                    isReadOnly && "bg-muted cursor-not-allowed"
                  )}
                  placeholder={isReadOnly ? "" : "Where can they grow?"}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted-foreground">Overall Comments</label>
                <textarea 
                  value={evaluation.overallComments}
                  readOnly={isReadOnly}
                  onChange={e => setEvaluation({...evaluation, overallComments: e.target.value})}
                  className={cn(
                    "w-full px-3 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 min-h-[100px] text-sm",
                    isReadOnly && "bg-muted cursor-not-allowed"
                  )}
                  placeholder={isReadOnly ? "" : "Final feedback for the employee..."}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
