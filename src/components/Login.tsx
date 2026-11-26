import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ShieldCheck, Mail, Lock, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { BrandLogo } from './BrandLogo';
import { environmentService } from '../services/environmentService';

export const Login: React.FC = () => {
  const { loginWithEmail, branding } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [canBootstrap, setCanBootstrap] = useState(false);

  useEffect(() => {
    const checkUsersExist = async () => {
      try {
        const { collection, getDocs, query, limit } = await import('firebase/firestore');
        const { db } = await import('../firebase');
        const usersCol = environmentService.getScopedCollectionName('users');
        const snap = await getDocs(query(collection(db, usersCol), limit(1)));
        setCanBootstrap(snap.empty);
      } catch {
        setCanBootstrap(false);
      }
    };
    checkUsersExist();
  }, []);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    
    setIsSubmitting(true);
    try {
      await loginWithEmail(email, password);
      toast.success('Logged in successfully');
    } catch (error: any) {
      console.error('Login error:', error);
      toast.error(error.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const bootstrapAdmin = async () => {
    setIsBootstrapping(true);
    try {
      const { setDoc, doc, getDocs, collection, query, limit } = await import('firebase/firestore');
      const { db } = await import('../firebase');

      const usersCol = environmentService.getScopedCollectionName('users');
      const existingSnap = await getDocs(query(collection(db, usersCol), limit(1)));
      if (!existingSnap.empty) {
        toast.info('System accounts already initialized. Contact an administrator for access.');
        setCanBootstrap(false);
        return;
      }

      const adminEmail = 'ganesh@symetricsystems.com';
      const adminRef = doc(db, usersCol, adminEmail);

      await setDoc(adminRef, {
        uid: adminEmail,
        email: adminEmail,
        displayName: 'Super Admin',
        role: 'super_admin',
        roles: ['super_admin'],
        status: 'active',
        password: 'admin', // Default password
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      toast.success('Admin account initialized! Please change the default password after signing in.');
      setEmail(adminEmail);
      setCanBootstrap(false);
    } catch (error: any) {
      console.error('Bootstrap error:', error);
      toast.error('Failed to initialize admin: ' + error.message);
    } finally {
      setIsBootstrapping(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4">
      <div className="w-full max-w-md bg-card rounded-2xl shadow-xl border overflow-hidden">
        <div className="p-8 text-center bg-primary/5 border-b flex flex-col items-center">
          <BrandLogo area="login" size="xl" className="mb-4 justify-center" />
          <h1 className="text-2xl font-bold">{branding.appName} Portal</h1>
          <p className="text-muted-foreground mt-1 text-sm">Enterprise Assessment & Performance Management</p>
        </div>

        <div className="p-8">
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email Address
              </label>
              <input 
                type="email" 
                required
                className="w-full px-4 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Password
              </label>
              <input 
                type="password" 
                required
                className="w-full px-4 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button 
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  <span>Sign In</span>
                </>
              )}
            </button>
            <p className="text-[10px] text-center text-muted-foreground mt-4">
              Please use your registered email and password to access the portal.
            </p>
          </form>

          {canBootstrap && (
            <div className="mt-6 pt-6 border-t">
              <button 
                onClick={bootstrapAdmin}
                disabled={isBootstrapping}
                className="w-full py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isBootstrapping ? (
                  <div className="w-3 h-3 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                ) : (
                  <>
                    <ShieldCheck className="w-3 h-3" />
                    <span>Initialize Super Admin</span>
                  </>
                )}
              </button>
              <p className="text-[9px] text-center text-muted-foreground mt-2">
                Initial setup only: creates the primary administrator account for this environment.
              </p>
            </div>
          )}
        </div>
      </div>
      
      <div className="mt-8 text-center text-xs text-muted-foreground">
        <p>© 2026 {branding.companyName || 'SyMetric Systems'}. All rights reserved.</p>
        <p className="mt-1">Access restricted to authorized personnel only.</p>
      </div>
    </div>
  );
};
