import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { 
  LayoutDashboard, 
  FileText, 
  Users, 
  ClipboardList, 
  CheckSquare, 
  BarChart3, 
  Bell, 
  LogOut, 
  User as UserIcon,
  Menu,
  X,
  Settings,
  ShieldCheck,
  Building2,
  Shield,
  CheckCircle2,
  AlertCircle,
  Info,
  ArrowLeft
} from 'lucide-react';
import { cn, formatDate } from './lib/utils';
import { firestoreService, query, where, orderBy, limit } from './services/firestoreService';
import Dashboard from './pages/Dashboard';
import TemplateList from './pages/TemplateList';
import TemplateEditor from './pages/TemplateEditor';
import AssignmentList from './pages/AssignmentList';
import AssignmentForm from './pages/AssignmentForm';
import SubmissionList from './pages/SubmissionList';
import EvaluationForm from './pages/EvaluationForm';
import AssessmentPortal from './pages/AssessmentPortal';
import UserManagement from './pages/UserManagement';
import RoleManagement from './pages/RoleManagement';
import DepartmentManagement from './pages/DepartmentManagement';
import AuditLogs from './pages/AuditLogs';
import Reports from './pages/Reports';
import { BrandLogo } from './components/BrandLogo';
import MyAssessments from './pages/MyAssessments';
import BrandingSettings from './pages/BrandingSettings';
import TrainingRegisterList from './pages/TrainingRegisterList';
import TrainingRegisterDetail from './pages/TrainingRegisterDetail';
import { BookOpen, ShieldAlert } from 'lucide-react';
import { Permission } from './types';

import { Login } from './components/Login';

const SidebarItem = ({ 
  to, 
  icon: Icon, 
  label, 
  active,
  onClick
}: { 
  to: string, 
  icon: any, 
  label: string, 
  active: boolean,
  onClick?: () => void
}) => (
  <Link
    to={to}
    onClick={onClick}
    className={cn(
      "flex items-center gap-3 px-3 sm:px-4 py-2.5 sm:py-3 text-sm font-medium transition-colors rounded-lg",
      active 
        ? "bg-primary text-primary-foreground shadow-xs" 
        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
    )}
  >
    <Icon className="w-5 h-5 shrink-0" />
    <span className="truncate">{label}</span>
  </Link>
);

const SidebarContent = ({ onClose }: { onClose?: () => void }) => {
  const { user, isAdmin, isHR, isReviewer, isQM, branding, hasPermission } = useAuth();
  const location = useLocation();

  return (
    <div className="flex flex-col h-full bg-card text-card-foreground">
      <div className="p-4 sm:p-5 flex items-center justify-between border-b bg-card shrink-0">
        <BrandLogo 
          area="nav"
          size="md" 
          showAppName 
          appNameClassName="text-base sm:text-lg font-bold tracking-tight"
          companyNameClassName="text-[10px]"
        />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 -mr-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg lg:hidden transition-colors"
            aria-label="Close navigation menu"
            title="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 sm:px-4 py-3 space-y-1 overflow-y-auto">
        {hasPermission('view_dashboard') && (
          <SidebarItem to="/" icon={LayoutDashboard} label="Dashboard" active={location.pathname === "/"} onClick={onClose} />
        )}
        
        <div className="pt-4 pb-2 px-3 sm:px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Employee</div>
        <SidebarItem to="/my-assessments" icon={ClipboardList} label="My Assessments" active={location.pathname === "/my-assessments"} onClick={onClose} />
        <SidebarItem to="/training-registers" icon={BookOpen} label="Training Registers" active={location.pathname.startsWith("/training-registers")} onClick={onClose} />

        {(hasPermission('manage_templates') || hasPermission('manage_assignments') || hasPermission('manage_training_registers')) && (
          <>
            <div className="pt-4 pb-2 px-3 sm:px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Management</div>
            {hasPermission('manage_templates') && <SidebarItem to="/templates" icon={FileText} label="Templates" active={location.pathname.startsWith("/templates")} onClick={onClose} />}
            {hasPermission('manage_assignments') && <SidebarItem to="/assignments" icon={ClipboardList} label="Assignments" active={location.pathname.startsWith("/assignments")} onClick={onClose} />}
            {hasPermission('manage_training_registers') && <SidebarItem to="/training-registers" icon={BookOpen} label="Training Register" active={location.pathname.startsWith("/training-registers")} onClick={onClose} />}
          </>
        )}

        {(hasPermission('evaluate_submissions') || isReviewer || isQM || isAdmin || isHR) && (
          <>
            <div className="pt-4 pb-2 px-3 sm:px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Evaluation</div>
            <SidebarItem to="/submissions" icon={CheckSquare} label="Submissions" active={location.pathname.startsWith("/submissions")} onClick={onClose} />
          </>
        )}

        {(hasPermission('manage_users') || hasPermission('manage_departments') || hasPermission('manage_branding') || hasPermission('view_audit_logs')) && (
          <>
            <div className="pt-4 pb-2 px-3 sm:px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Admin</div>
            {hasPermission('manage_users') && <SidebarItem to="/users" icon={Users} label="Users" active={location.pathname === "/users"} onClick={onClose} />}
            {hasPermission('manage_users') && <SidebarItem to="/roles" icon={Shield} label="Roles" active={location.pathname === "/roles"} onClick={onClose} />}
            {hasPermission('manage_departments') && <SidebarItem to="/departments" icon={Building2} label="Departments" active={location.pathname === "/departments"} onClick={onClose} />}
            {hasPermission('manage_branding') && <SidebarItem to="/branding" icon={LayoutDashboard} label="Branding" active={location.pathname === "/branding"} onClick={onClose} />}
            {hasPermission('view_audit_logs') && <SidebarItem to="/audit-logs" icon={Settings} label="Audit Logs" active={location.pathname === "/audit-logs"} onClick={onClose} />}
          </>
        )}

        {hasPermission('view_reports') && (
          <>
            <div className="pt-4 pb-2 px-3 sm:px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Insights</div>
            <SidebarItem to="/reports" icon={BarChart3} label="Reports" active={location.pathname === "/reports"} onClick={onClose} />
          </>
        )}
      </nav>

      <div className="p-3 sm:p-4 border-t shrink-0">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-accent/40">
          <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center shrink-0">
            <UserIcon className="w-4 h-4 text-accent-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.displayName}</p>
            <p className="text-xs text-muted-foreground truncate capitalize">{user?.role?.replace('_', ' ')}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const Header = ({ onOpenMobileMenu }: { onOpenMobileMenu: () => void }) => {
  const { logout, branding, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    // In a real app, we'd have a 'notifications' collection.
    // For now, let's simulate notifications based on recent audit logs or assignments
    // or better, let's just implement a basic listener if the collection exists.
    const unsubscribe = firestoreService.subscribeToCollection<any>(
      'notifications',
      [where('userId', '==', user.uid), orderBy('createdAt', 'desc'), limit(10)],
      (data) => {
        setNotifications(data);
        setUnreadCount(data.filter(n => !n.read).length);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const markAsRead = async (id: string) => {
    await firestoreService.updateDocument('notifications', id, { read: true });
  };

  const markAllAsRead = async () => {
    for (const n of notifications) {
      if (!n.read) {
        await markAsRead(n.id);
      }
    }
  };

  return (
    <header className="h-16 border-b bg-background flex items-center justify-between px-3 sm:px-6 lg:px-8 relative shrink-0">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {/* Mobile menu toggle hamburger */}
        <button 
          type="button"
          onClick={onOpenMobileMenu}
          className="p-2 -ml-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg lg:hidden transition-colors shrink-0"
          aria-label="Open navigation menu"
          title="Open Menu"
        >
          <Menu className="w-6 h-6" />
        </button>

        {location.pathname !== '/' && (
          <button 
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-accent rounded-lg transition-all group flex items-center gap-1 shrink-0"
            title="Go Back"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-transform group-hover:-translate-x-1" />
            <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground hidden sm:inline">Back</span>
          </button>
        )}
        
        <div className="flex items-center gap-2 min-w-0">
          <BrandLogo area="nav" size="xs" className="lg:hidden shrink-0" />
          <h2 className="text-sm sm:text-base lg:text-lg font-semibold truncate">
            {branding.appName} Portal
          </h2>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        <div className="relative">
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors relative"
            title="Notifications"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-background">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setShowNotifications(false)}
              />
              <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-card border rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="p-4 border-b flex items-center justify-between bg-muted/30">
                  <h3 className="font-bold text-sm">Notifications</h3>
                  {unreadCount > 0 && (
                    <button 
                      onClick={markAllAsRead}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length > 0 ? (
                    <div className="divide-y">
                      {notifications.map((n) => (
                        <div 
                          key={n.id} 
                          className={cn(
                            "p-4 hover:bg-muted/50 transition-colors cursor-pointer flex gap-3",
                            !n.read && "bg-primary/5"
                          )}
                          onClick={() => {
                            markAsRead(n.id);
                            setShowNotifications(false);
                            if ((n as any).link) {
                              navigate((n as any).link);
                            }
                          }}
                        >
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                            n.type === 'success' ? "bg-emerald-100 text-emerald-600" :
                            n.type === 'warning' ? "bg-amber-100 text-amber-600" :
                            "bg-blue-100 text-blue-600"
                          )}>
                            {n.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> :
                             n.type === 'warning' ? <AlertCircle className="w-4 h-4" /> :
                             <Info className="w-4 h-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-sm", !n.read ? "font-bold" : "font-medium")}>{n.title}</p>
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">{formatDate(n.createdAt)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center">
                      <Bell className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No notifications yet</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        <button 
          onClick={logout}
          className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
          title="Logout"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
};

const ProtectedRoute = ({
  children,
  requiredPermissions,
  fallbackPath
}: {
  children: React.ReactNode;
  requiredPermissions?: Permission[];
  fallbackPath?: string;
}) => {
  const { user, loading, hasPermission } = useAuth();

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (!user) {
    return <Login />;
  }

  if (requiredPermissions && requiredPermissions.length > 0) {
    const allowed = requiredPermissions.some((perm) => hasPermission(perm));
    if (!allowed) {
      if (fallbackPath) {
        return <Navigate to={fallbackPath} replace />;
      }
      return (
        <div className="max-w-lg mx-auto mt-16 p-8 bg-card border rounded-2xl shadow-sm text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold">Access Restricted</h2>
          <p className="text-sm text-muted-foreground">
            You do not have permission to access this module. Please contact your system administrator if you believe this is an error.
          </p>
          <Link
            to="/my-assessments"
            className="inline-flex items-center justify-center px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Go to My Assessments
          </Link>
        </div>
      );
    }
  }

  return <>{children}</>;
};

const MainLayout = ({ children }: { children: React.ReactNode }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Close mobile drawer automatically when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Lock background scrolling on mobile while drawer is active
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Desktop Sidebar: Always visible on large screens (lg:) */}
      <aside className="hidden lg:flex flex-col w-64 h-screen border-r bg-card text-card-foreground shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile Drawer Backdrop */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-label="Close navigation menu backdrop"
        />
      )}

      {/* Mobile Slide-in Drawer */}
      <div 
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] h-screen bg-card text-card-foreground shadow-2xl flex flex-col border-r lg:hidden transition-transform duration-300 ease-in-out",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full pointer-events-none"
        )}
      >
        <SidebarContent onClose={() => setIsMobileMenuOpen(false)} />
      </div>

      {/* Main Content: Takes 100% full screen width on mobile! */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header onOpenMobileMenu={() => setIsMobileMenuOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <>
      <Toaster position="top-right" richColors />
      <Router>
        <Routes>
          {/* Public Assessment Link - Now Protected to ensure identity */}
          <Route path="/portal/:assignmentId" element={
            <ProtectedRoute>
              <AssessmentPortal />
            </ProtectedRoute>
          } />
          
          {/* Protected Routes */}
          <Route path="/*" element={
            <ProtectedRoute>
              <MainLayout>
                <Routes>
                  <Route path="/" element={<ProtectedRoute requiredPermissions={['view_dashboard']} fallbackPath="/my-assessments"><Dashboard /></ProtectedRoute>} />
                  <Route path="/my-assessments" element={<MyAssessments />} />
                  <Route path="/templates" element={<ProtectedRoute requiredPermissions={['manage_templates']}><TemplateList /></ProtectedRoute>} />
                  <Route path="/templates/new" element={<ProtectedRoute requiredPermissions={['manage_templates']}><TemplateEditor /></ProtectedRoute>} />
                  <Route path="/templates/edit/:id" element={<ProtectedRoute requiredPermissions={['manage_templates']}><TemplateEditor /></ProtectedRoute>} />
                  <Route path="/assignments" element={<ProtectedRoute requiredPermissions={['manage_assignments']}><AssignmentList /></ProtectedRoute>} />
                  <Route path="/assignments/new" element={<ProtectedRoute requiredPermissions={['manage_assignments']}><AssignmentForm /></ProtectedRoute>} />
                  <Route path="/submissions" element={<ProtectedRoute requiredPermissions={['evaluate_submissions', 'view_reports']}><SubmissionList /></ProtectedRoute>} />
                  <Route path="/evaluate/:submissionId" element={<ProtectedRoute requiredPermissions={['evaluate_submissions', 'view_reports']}><EvaluationForm /></ProtectedRoute>} />
                  <Route path="/users" element={<ProtectedRoute requiredPermissions={['manage_users']}><UserManagement /></ProtectedRoute>} />
                  <Route path="/roles" element={<ProtectedRoute requiredPermissions={['manage_users']}><RoleManagement /></ProtectedRoute>} />
                  <Route path="/departments" element={<ProtectedRoute requiredPermissions={['manage_departments']}><DepartmentManagement /></ProtectedRoute>} />
                  <Route path="/branding" element={<ProtectedRoute requiredPermissions={['manage_branding']}><BrandingSettings /></ProtectedRoute>} />
                  <Route path="/audit-logs" element={<ProtectedRoute requiredPermissions={['view_audit_logs']}><AuditLogs /></ProtectedRoute>} />
                  <Route path="/reports" element={<ProtectedRoute requiredPermissions={['view_reports']}><Reports /></ProtectedRoute>} />
                  <Route path="/training-registers" element={<TrainingRegisterList />} />
                  <Route path="/training-registers/new" element={<ProtectedRoute requiredPermissions={['manage_training_registers']}><TrainingRegisterDetail /></ProtectedRoute>} />
                  <Route path="/training-registers/:id" element={<TrainingRegisterDetail />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </MainLayout>
            </ProtectedRoute>
          } />
        </Routes>
      </Router>
    </>
  );
}
