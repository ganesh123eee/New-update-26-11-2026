import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  addDoc,
  onSnapshot,
  Timestamp,
  getDocFromServer,
  limit
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { environmentService } from './environmentService';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: any[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export { where, query, limit, orderBy } from 'firebase/firestore';

export type AuditEntityCategory =
  | 'assessment_report'
  | 'training_register'
  | 'template'
  | 'assignment'
  | 'system';

export function inferAuditEntityType(logOrParams: {
  entityType?: string;
  module?: string;
  action?: string;
  details?: any;
}): AuditEntityCategory {
  const explicit = logOrParams.entityType;
  if (
    explicit === 'assessment_report' ||
    explicit === 'training_register' ||
    explicit === 'template' ||
    explicit === 'assignment' ||
    explicit === 'system'
  ) {
    return explicit;
  }

  const mod = String(logOrParams.module || '').toLowerCase();
  const act = String(logOrParams.action || '').toLowerCase();
  const det = logOrParams.details || {};

  if (det.registerId || mod.includes('training register') || act.includes('training register')) {
    return 'training_register';
  }

  if (
    !mod.includes('dashboard') &&
    (det.submissionId ||
      det.evaluationId ||
      mod.includes('report') ||
      mod.includes('review') ||
      mod.includes('evaluation') ||
      mod.includes('assessment') ||
      act.includes('evaluation') ||
      act.includes('assessment') ||
      act.includes('submission') ||
      (act.includes('report') && !mod.includes('audit')))
  ) {
    return 'assessment_report';
  }

  if (det.templateId || mod.includes('template') || act.includes('template')) {
    return 'template';
  }

  if (det.assignmentId || mod.includes('assignment') || act.includes('assignment') || act.includes('assigned')) {
    return 'assignment';
  }

  return 'system';
}

export function inferAuditReason(action: string, module: string, details: any = {}): string {
  if (details?.why && typeof details.why === 'string' && details.why.trim()) {
    return details.why.trim();
  }
  if (details?.reason && typeof details.reason === 'string' && details.reason.trim()) {
    return details.reason.trim();
  }
  const act = String(action || '').toLowerCase();
  const mod = String(module || '').toLowerCase();

  if (act.includes('login')) return 'To authenticate into the portal and start an authorized user session.';
  if (act.includes('logout')) return 'To securely end the active user session.';
  if (act.includes('opened training register')) {
    return 'Mandatory pre-signature inspection: register opened on screen so the signer reviews training details and reference SOP before signing.';
  }
  if (act.includes('document reviewed')) {
    return 'Mandatory compliance step before digital sign-off to verify the training document was read and understood.';
  }
  if (act.includes('attendee signed')) {
    return 'Sequential trainee sign-off confirming attendance and understanding of the training session.';
  }
  if (act.includes('trainer signed')) {
    return 'Final trainer verification confirming all trainees attended and completed the training register.';
  }
  if (act.includes('created training register') || act.includes('updated training register')) {
    return details?.workflowStatus === 'in_progress' || act.includes('workflow')
      ? 'To establish the training record and initiate the sequential digital signature workflow.'
      : 'To create or update the training register details prior to initiating sign-off.';
  }
  if (act.includes('deleted training register')) {
    return 'To remove an obsolete or erroneous training register record.';
  }
  if (act.includes('evaluation') || mod.includes('evaluation') || mod.includes('review')) {
    return 'To grade submitted answers, determine pass/fail competency result, and notify stakeholders.';
  }
  if (act.includes('submitted assessment') || act.includes('submit')) {
    return 'To submit completed assessment responses for grading and quality review.';
  }
  if (act.includes('started assessment') || act.includes('start')) {
    return 'To begin the assigned competency assessment attempt.';
  }
  if (act.includes('auto-save') || act.includes('saved progress')) {
    return 'To preserve in-progress assessment responses against accidental interruption.';
  }
  if (act.includes('assignment') || act.includes('assigned')) {
    return 'To assign a competency assessment to target personnel with a designated assessor and schedule.';
  }
  if (act.includes('template')) {
    return 'To maintain standardized questionnaire or training register specifications and version control.';
  }
  if (act.includes('branding')) {
    return 'To configure environment-specific organization branding and report headers.';
  }
  if (act.includes('user') || mod.includes('user')) {
    return 'To administer user accounts, roles, and access permissions.';
  }
  if (act.includes('role') || mod.includes('role')) {
    return 'To configure role-based access control permissions.';
  }
  if (act.includes('department')) {
    return 'To maintain organizational department structures.';
  }
  if (act.includes('export') || act.includes('download') || mod.includes('report')) {
    return 'To generate and inspect compliance reports or audit documentation.';
  }
  return `To record ${action || 'this activity'} within the ${module || 'system'} module for compliance traceability.`;
}

export function inferAuditStage(action: string, module: string, details: any = {}): string {
  if (details?.when && typeof details.when === 'string' && details.when.trim()) {
    return details.when.trim();
  }
  const act = String(action || '').toLowerCase();
  const mod = String(module || '').toLowerCase();

  if (act.includes('login') || act.includes('logout')) return 'Session Authentication';
  if (act.includes('created') || act.includes('assigned')) return 'Initiation / Setup';
  if (act.includes('opened')) return 'Pre-Signature Access Verification';
  if (act.includes('document reviewed')) return 'Mandatory Document Review';
  if (act.includes('attendee signed')) return 'Sequential Trainee Sign-off';
  if (act.includes('trainer signed')) return 'Final Trainer Sign-off & Closure';
  if (act.includes('started')) return 'Assessment Attempt Started';
  if (act.includes('submitted')) return 'Candidate Submission';
  if (act.includes('evaluation') || act.includes('completed')) return 'Assessor Evaluation & Result Closure';
  if (act.includes('updated') || act.includes('edited')) return 'Record Modification';
  if (act.includes('deleted')) return 'Record Removal';
  if (mod.includes('report')) return 'Reporting & Audit Export';
  return `${module || 'System'} Execution`;
}

export const firestoreService = {
  resolveDocRef(path: string, id: string) {
    if (path === 'settings') {
      const scoped = environmentService.getScopedDocPath(path, id);
      return doc(db, scoped.collection, scoped.docId);
    }
    const scopedPath = environmentService.getScopedCollectionName(path);
    return doc(db, scopedPath, id);
  },

  resolveColRef(path: string) {
    const scopedPath = environmentService.getScopedCollectionName(path);
    return collection(db, scopedPath);
  },
  async getDocument<T>(path: string, id: string): Promise<T | null> {
    if (!id) {
      console.error(`getDocument called with missing ID for path: ${path}`);
      return null;
    }
    try {
      const docRef = this.resolveDocRef(path, id);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? ({ ...(docSnap.data() as Record<string, any>), id: docSnap.id } as T) : null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${path}/${id}`);
      return null;
    }
  },

  async getCollection<T>(path: string, constraints: any[] = []): Promise<T[]> {
    try {
      const colRef = this.resolveColRef(path);
      const q = query(colRef, ...constraints);
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ ...(doc.data() as Record<string, any>), id: doc.id } as T));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },

  async createDocument<T>(path: string, data: any, id?: string): Promise<string> {
    try {
      if (id) {
        const docRef = this.resolveDocRef(path, id);
        await setDoc(docRef, { ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        return id;
      } else {
        const colRef = this.resolveColRef(path);
        const docRef = await addDoc(colRef, { ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        return docRef.id;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
      return '';
    }
  },

  async updateDocument(path: string, id: string, data: any): Promise<void> {
    if (!id) {
      console.error(`updateDocument called with missing ID for path: ${path}`);
      return;
    }
    try {
      const docRef = this.resolveDocRef(path, id);
      await updateDoc(docRef, { ...data, updatedAt: new Date().toISOString() });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${path}/${id}`);
    }
  },

  async deleteDocument(path: string, id: string): Promise<void> {
    if (!id) {
      console.error(`deleteDocument called with missing ID for path: ${path}`);
      return;
    }
    try {
      const docRef = this.resolveDocRef(path, id);
      await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${path}/${id}`);
    }
  },

  subscribeToCollection<T>(path: string, constraints: any[], callback: (data: T[]) => void) {
    const colRef = this.resolveColRef(path);
    const q = query(colRef, ...constraints);
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map(doc => ({ ...(doc.data() as Record<string, any>), id: doc.id } as T)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
  },

  async testConnection() {
    try {
      console.log('Testing Firestore connection...');
      await getDocFromServer(doc(db, 'test', 'connection'));
      console.log('Firestore connection successful.');
    } catch (error: any) {
      if (error.message?.includes('the client is offline')) {
        console.error("CRITICAL: Firestore is reporting offline. This usually means the Firebase configuration is incorrect or the database is not provisioned correctly.");
        console.error("Current Config:", {
          projectId: db.app.options.projectId,
          databaseId: (db as any)._databaseId?.database || 'default'
        });
      } else {
        // Ignore other errors like "not found" as the document might not exist
        console.log('Firestore connection test completed (ignoring non-offline errors).');
      }
    }
  },

  async logActivity(
    action: string,
    module: string,
    details: any = {},
    userId?: string,
    userEmail?: string,
    meta?: {
      entityType?: string;
      entityId?: string;
      entityTitle?: string;
      changes?: Array<{ field: string; from?: any; to?: any }>;
      why?: string;
      when?: string;
    }
  ) {
    try {
      const finalUserId = userId || auth.currentUser?.uid || 'system';
      const finalUserEmail = userEmail || auth.currentUser?.email || 'system@symetricsystems.com';
      const nowIso = new Date().toISOString();

      const inferredEntityId =
        meta?.entityId ||
        details?.entityId ||
        details?.submissionId ||
        details?.registerId ||
        details?.templateId ||
        details?.assignmentId ||
        details?.id;

      const inferredEntityType = inferAuditEntityType({
        entityType: meta?.entityType || details?.entityType,
        module,
        action,
        details
      });

      const inferredEntityTitle =
        meta?.entityTitle ||
        details?.entityTitle ||
        details?.trainingTitle ||
        details?.templateName ||
        details?.name ||
        details?.reportType;

      const finalWhy = (meta?.why && meta.why.trim()) || inferAuditReason(action, module, details);
      const finalWhen = (meta?.when && meta.when.trim()) || inferAuditStage(action, module, details);

      const payload: Record<string, any> = {
        userId: finalUserId,
        userEmail: finalUserEmail,
        action,
        module,
        timestamp: nowIso,
        when: finalWhen,
        why: finalWhy,
        details
      };

      if (inferredEntityType) payload.entityType = inferredEntityType;
      if (inferredEntityId) payload.entityId = String(inferredEntityId);
      if (inferredEntityTitle) payload.entityTitle = String(inferredEntityTitle);
      if (meta?.changes && meta.changes.length > 0) payload.changes = meta.changes;
      
      const colRef = this.resolveColRef('auditLogs');
      await addDoc(colRef, payload);
    } catch (error) {
      console.error('Failed to log activity:', error);
    }
  },

  async clearTransactionalData() {
    const collectionsToClear = ['submissions', 'reviews', 'assignments', 'auditLogs', 'notifications', 'mail'];
    
    for (const colName of collectionsToClear) {
      try {
        const colRef = this.resolveColRef(colName);
        const snapshot = await getDocs(colRef);
        console.log(`Clearing ${snapshot.size} documents from ${colRef.path}...`);
        
        const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
        console.log(`Successfully cleared ${colRef.path}.`);
      } catch (error) {
        console.error(`Failed to clear collection ${colName}:`, error);
        // Don't throw here, try to clear other collections
      }
    }
  },

  async bootstrapRoles() {
    try {
      const rolesCol = this.resolveColRef('roles');
      const rolesSnap = await getDocs(rolesCol);
      if (rolesSnap.empty) {
        console.log(`Bootstrapping default roles for environment ${rolesCol.path}...`);
        const defaultRoles = [
          {
            id: 'super_admin',
            name: 'Super Admin',
            description: 'Full system access',
            permissions: ['view_dashboard', 'manage_templates', 'manage_assignments', 'evaluate_submissions', 'manage_users', 'manage_departments', 'view_reports', 'view_audit_logs', 'manage_branding', 'view_my_assessments', 'manage_training_registers'],
            isSystem: true
          },
          {
            id: 'hr_admin',
            name: 'HR Admin',
            description: 'Manage assessments and users',
            permissions: ['view_dashboard', 'manage_templates', 'manage_assignments', 'evaluate_submissions', 'manage_users', 'manage_departments', 'view_reports', 'view_my_assessments', 'manage_training_registers'],
            isSystem: true
          },
          {
            id: 'quality_management',
            name: 'Quality Management',
            description: 'Manage assessment templates and assignments',
            permissions: ['view_dashboard', 'manage_templates', 'manage_assignments', 'evaluate_submissions', 'view_reports', 'view_audit_logs', 'view_my_assessments', 'manage_training_registers'],
            isSystem: true
          },
          {
            id: 'reviewer',
            name: 'Reviewer',
            description: 'Evaluate submissions',
            permissions: ['view_dashboard', 'evaluate_submissions', 'view_my_assessments'],
            isSystem: true
          },
          {
            id: 'employee',
            name: 'Employee',
            description: 'Take assessments',
            permissions: ['view_my_assessments'],
            isSystem: true
          }
        ];

        for (const role of defaultRoles) {
          await setDoc(doc(rolesCol, role.id), {
            ...role,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
        console.log('Roles bootstrap complete.');
      }
    } catch (error) {
      console.error('Roles bootstrap failed:', error);
      handleFirestoreError(error, OperationType.LIST, 'roles');
    }
  },

  async bootstrap() {
    try {
      const envId = environmentService.getEnvironmentId();
      console.log(`Bootstrapping for environment: ${envId}`);

      // Bootstrap roles first
      await this.bootstrapRoles();

      const usersCol = this.resolveColRef('users');
      const usersSnap = await getDocs(query(usersCol, limit(1)));
      if (usersSnap.empty) {
        console.log(`Bootstrapping initial users for environment ${envId}...`);
        
        let copied = false;
        if (envId !== 'production') {
          try {
            const primaryUsers = await getDocs(collection(db, 'users'));
            if (!primaryUsers.empty) {
              for (const uDoc of primaryUsers.docs) {
                await setDoc(doc(usersCol, uDoc.id), uDoc.data());
              }
              copied = true;
              console.log(`Cloned ${primaryUsers.size} users to isolated environment ${envId}`);
            }
          } catch (e) {
            console.warn('Could not copy users from primary collection:', e);
          }
        }

        if (!copied) {
          const adminEmails = ['ganesh@symetricsystems.com', 'ganesh123eee@gmail.com'];
          for (const email of adminEmails) {
            await setDoc(doc(usersCol, email), {
              uid: email,
              email: email,
              displayName: 'Super Admin',
              role: 'super_admin',
              roles: ['super_admin'],
              status: 'active',
              password: 'admin', // Default password
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
          }
        }
      }

      // If templates in this environment are empty and we are on an isolated environment, copy default templates
      if (envId !== 'production') {
        const templatesCol = this.resolveColRef('templates');
        const templatesSnap = await getDocs(query(templatesCol, limit(1)));
        if (templatesSnap.empty) {
          try {
            const primaryTemplates = await getDocs(collection(db, 'templates'));
            for (const tDoc of primaryTemplates.docs) {
              await setDoc(doc(templatesCol, tDoc.id), tDoc.data());
            }
            console.log(`Cloned ${primaryTemplates.size} initial templates to isolated environment ${envId}`);
          } catch (e) {
            console.warn('Could not copy templates from primary collection:', e);
          }
        }
      }
      
      // Also bootstrap branding if not already configured for this environment
      const brandingDocRef = this.resolveDocRef('settings', 'branding');
      const brandingSnap = await getDoc(brandingDocRef);
      if (!brandingSnap.exists()) {
        let initialBranding = {
          appName: 'AssessPro',
          companyName: 'SyMetric Systems',
          logoUrl: '/logo.svg',
          primaryColor: '#0f172a',
          updatedAt: new Date().toISOString()
        };
        try {
          const primaryBranding = await getDoc(doc(db, 'settings', 'branding'));
          if (primaryBranding.exists()) {
            initialBranding = { ...initialBranding, ...primaryBranding.data(), updatedAt: new Date().toISOString() };
          }
        } catch (e) {
          console.warn('Could not copy branding from primary collection:', e);
        }

        await setDoc(brandingDocRef, initialBranding);
      }
      console.log('Bootstrap complete.');
    } catch (error) {
      console.error('Bootstrap failed:', error);
      handleFirestoreError(error, OperationType.WRITE, 'users');
    }
  },

  async resetTransactionData() {
    try {
      const collectionsToClear = [
        'assignments',
        'submissions',
        'reviews',
        'training_registers',
        'notifications',
        'auditLogs'
      ];

      let deletedCount = 0;
      for (const colName of collectionsToClear) {
        const colRef = this.resolveColRef(colName);
        const snap = await getDocs(colRef);
        for (const docSnap of snap.docs) {
          await deleteDoc(doc(colRef, docSnap.id));
          deletedCount++;
        }
      }

      return { success: true, deletedCount };
    } catch (error) {
      console.error('Reset transaction data failed:', error);
      handleFirestoreError(error, OperationType.DELETE, 'transactions');
      throw error;
    }
  }
};
