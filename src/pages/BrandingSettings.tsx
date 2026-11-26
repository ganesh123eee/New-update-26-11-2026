import React, { useState, useEffect } from 'react';
import { Save, Image as ImageIcon, Type, Layout, ShieldCheck, Loader2, RotateCcw, AlertTriangle, Server, Globe, Database, SlidersHorizontal, CheckCircle2 } from 'lucide-react';
import { firestoreService } from '../services/firestoreService';
import { environmentService, EnvironmentInfo } from '../services/environmentService';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { BrandLogo } from '../components/BrandLogo';

interface BrandingSettings {
  appName: string;
  companyName: string;
  logoUrl: string;
  primaryColor?: string;
  restrictAcrossApp: boolean;
  logoPlacement: {
    applyToNav: boolean;
    applyToLogin: boolean;
    applyToPortal: boolean;
    applyToReports: boolean;
  };
}

export default function BrandingSettings() {
  const { user, branding, updateBranding, hasPermission, isAdmin } = useAuth();
  const canManageBranding = hasPermission('manage_branding');
  const [showResetModal, setShowResetModal] = useState(false);
  const [settings, setSettings] = useState<BrandingSettings>({
    appName: branding?.appName || 'AssessPro',
    companyName: branding?.companyName || '',
    logoUrl: branding?.logoUrl || '',
    primaryColor: branding?.primaryColor || '#0f172a',
    restrictAcrossApp: branding?.restrictAcrossApp !== undefined ? branding.restrictAcrossApp : true,
    logoPlacement: branding?.logoPlacement || {
      applyToNav: false,
      applyToLogin: false,
      applyToPortal: false,
      applyToReports: true,
    }
  });
  const [saving, setSaving] = useState(false);
  const [savingLogo, setSavingLogo] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [envInfo, setEnvInfo] = useState<EnvironmentInfo>(environmentService.getEnvironmentInfo());
  const [customEnvId, setCustomEnvId] = useState<string>(envInfo.id);
  const [savingEnv, setSavingEnv] = useState(false);

  const handleUpdateEnv = () => {
    if (!isAdmin) {
      toast.error('Access Denied: Only Super Admins can switch environment scopes.');
      return;
    }
    setSavingEnv(true);
    try {
      environmentService.setEnvironmentId(customEnvId);
      toast.success('Environment identifier updated. Reloading...');
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (e) {
      toast.error('Failed to update environment identifier');
      setSavingEnv(false);
    }
  };

  useEffect(() => {
    if (branding) {
      setSettings(prev => ({
        ...prev,
        appName: branding.appName || 'AssessPro',
        companyName: branding.companyName || '',
        logoUrl: branding.logoUrl || '',
        primaryColor: branding.primaryColor || '#0f172a',
        restrictAcrossApp: branding.restrictAcrossApp !== undefined ? branding.restrictAcrossApp : true,
        logoPlacement: branding.logoPlacement || {
          applyToNav: false,
          applyToLogin: false,
          applyToPortal: false,
          applyToReports: true,
        }
      }));
    }
  }, [branding]);

  useEffect(() => {
    // Log viewing activity
    firestoreService.logActivity('Viewed Branding Settings', 'Settings', {}, user?.uid, user?.email).catch(console.error);
  }, []);

  const handleSave = async () => {
    if (!canManageBranding) {
      toast.error('Access Denied: You do not have permission to update branding settings.');
      return;
    }
    setSaving(true);
    try {
      await updateBranding(settings);
      await firestoreService.logActivity('Updated Branding Settings', 'Settings', settings, user?.uid, user?.email, {
        entityType: 'system',
        entityId: 'branding',
        entityTitle: settings.companyName || settings.appName || 'Branding Settings'
      });
      toast.success('Branding settings saved successfully');
    } catch (error) {
      console.error(error);
      toast.error('Failed to update branding settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLogoUrl = async () => {
    if (!canManageBranding) {
      toast.error('Access Denied: You do not have permission to update branding settings.');
      return;
    }
    setSavingLogo(true);
    try {
      await updateBranding({ 
        logoUrl: settings.logoUrl.trim(),
        restrictAcrossApp: settings.restrictAcrossApp,
        logoPlacement: settings.logoPlacement
      });
      await firestoreService.logActivity('Updated Logo URL', 'Settings', { logoUrl: settings.logoUrl.trim() }, user?.uid, user?.email, {
        entityType: 'system',
        entityId: 'branding',
        entityTitle: 'Brand Logo URL'
      });
      if (settings.restrictAcrossApp) {
        toast.success('Logo URL saved with app restrictions enabled (not applied across entire app)');
      } else {
        toast.success('Logo URL updated successfully');
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to update logo URL');
    } finally {
      setSavingLogo(false);
    }
  };

  const [resetting, setResetting] = useState(false);
  const handleResetData = async () => {
    if (!isAdmin) {
      toast.error('Access Denied: Only Super Admins can reset system data.');
      return;
    }
    setResetting(true);
    try {
      await firestoreService.clearTransactionalData();
      await firestoreService.logActivity('Reset System Data', 'Settings', { action: 'Full Transactional Reset' }, user?.uid, user?.email, {
        entityType: 'system',
        entityId: 'system_reset',
        entityTitle: 'Transactional Data Reset'
      });
      toast.success('System data has been reset successfully.');
      setShowResetModal(false);
      window.location.reload();
    } catch (error) {
      console.error(error);
      toast.error('Failed to reset system data.');
    } finally {
      setResetting(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canManageBranding) {
      toast.error('Access Denied: You do not have permission to upload branding assets.');
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      toast.error('File size exceeds 8MB limit.');
      return;
    }

    setUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rawDataUrl = ev.target?.result as string;
      
      // Auto-compress and scale image using an offscreen canvas to keep document size light & fast
      const img = new Image();
      img.onload = async () => {
        try {
          const maxDim = 360;
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          let optimizedDataUrl = rawDataUrl;

          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            
            const pngData = canvas.toDataURL('image/png');
            if (pngData.length > 200000) {
              optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
            } else {
              optimizedDataUrl = pngData;
            }
          }

          // Immediately update state, persist to Firestore and sync via AuthContext
          setSettings(prev => ({ ...prev, logoUrl: optimizedDataUrl }));
          await updateBranding({ 
            logoUrl: optimizedDataUrl,
            restrictAcrossApp: settings.restrictAcrossApp,
            logoPlacement: settings.logoPlacement
          });
          await firestoreService.logActivity('Uploaded and updated brand logo', 'Settings', { hasLogo: true, restricted: settings.restrictAcrossApp }, user?.uid, user?.email);
          if (settings.restrictAcrossApp) {
            toast.success('Logo uploaded with restrictions enabled (not applied across entire app)');
          } else {
            toast.success('Logo uploaded and saved successfully');
          }
        } catch (err) {
          console.error('Failed to save uploaded logo:', err);
          toast.error('Failed to save uploaded logo');
        } finally {
          setUploading(false);
          if (e.target) e.target.value = '';
        }
      };
      img.onerror = () => {
        setUploading(false);
        toast.error('Failed to parse uploaded image');
        if (e.target) e.target.value = '';
      };
      img.src = rawDataUrl;
    };
    reader.onerror = () => {
      setUploading(false);
      toast.error('Failed to read logo file');
      if (e.target) e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  if (!canManageBranding) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold">Access Restricted</h2>
        <p className="text-sm text-muted-foreground">
          You do not have permission to view or modify application branding settings.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Application Branding</h1>
        <p className="text-muted-foreground mt-1">Customize the application name, logo, and visual identity.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-card p-6 rounded-2xl border shadow-sm space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Type className="w-4 h-4" />
                  Application Name
                </label>
                <input 
                  type="text"
                  className="w-full px-4 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                  value={settings.appName}
                  onChange={(e) => setSettings({ ...settings, appName: e.target.value })}
                  placeholder="e.g. AssessPro Enterprise"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Layout className="w-4 h-4" />
                  Company Name
                </label>
                <input 
                  type="text"
                  className="w-full px-4 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                  value={settings.companyName}
                  onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                  placeholder="e.g. Acme Corporation"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  Logo
                </label>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input 
                      type="text"
                      className="flex-1 px-4 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 text-xs sm:text-sm font-mono"
                      value={settings.logoUrl}
                      onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
                      placeholder="https://example.com/logo.png or upload below"
                    />
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleSaveLogoUrl}
                        disabled={savingLogo || uploading}
                        className="px-3 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0 flex items-center gap-1.5"
                        title="Apply and save this logo URL"
                      >
                        {savingLogo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        <span>Save URL</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setSettings(prev => ({ ...prev, logoUrl: '/logo.svg' }));
                          await updateBranding({ logoUrl: '/logo.svg' });
                          toast.success('Logo reset to default logo');
                        }}
                        className="px-3 py-2 bg-muted hover:bg-accent text-xs font-semibold rounded-lg border transition-colors shrink-0"
                        title="Reset to the default AssessPro SVG logo"
                      >
                        Default
                      </button>
                      {settings.logoUrl && (
                        <button
                          type="button"
                          onClick={async () => {
                            setSettings(prev => ({ ...prev, logoUrl: '' }));
                            await updateBranding({ logoUrl: '' });
                            toast.success('Logo removed');
                          }}
                          className="px-3 py-2 text-destructive hover:bg-destructive/10 text-xs font-semibold rounded-lg border border-destructive/20 transition-colors shrink-0"
                          title="Remove logo and use default shield icon"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="relative">
                    <label className={`flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer hover:bg-accent transition-all group ${uploading ? 'opacity-70 pointer-events-none' : ''}`}>
                      {uploading ? (
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      )}
                      <span className="text-sm font-medium">
                        {uploading ? 'Processing & saving logo...' : 'Click to upload logo image (saves automatically)'}
                      </span>
                      <input 
                        type="file" 
                        accept="image/*"
                        className="hidden" 
                        onChange={handleLogoUpload}
                        disabled={uploading}
                      />
                    </label>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">Provide an image URL or upload an image file (PNG, JPG, SVG, WebP). Uploaded logos are automatically optimized and cached locally for this environment.</p>

                {/* Logo Restrictions Card */}
                <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <SlidersHorizontal className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <span className="text-sm font-semibold text-foreground">Restrict Logo — Do Not Update Across Entire App</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        When enabled, the custom uploaded logo will NOT overwrite native icons and headers across the rest of the application.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                      <input
                        type="checkbox"
                        checked={settings.restrictAcrossApp}
                        onChange={async (e) => {
                          const val = e.target.checked;
                          setSettings(prev => ({ ...prev, restrictAcrossApp: val }));
                          await updateBranding({ restrictAcrossApp: val });
                          if (val) {
                            toast.success('Restrictions activated: Logo will not update across the entire app');
                          } else {
                            toast.success('Restrictions disabled: Logo applies across all views');
                          }
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                    </label>
                  </div>

                  {settings.restrictAcrossApp ? (
                    <div className="pt-3 border-t border-amber-500/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                          Selectively Allow Logo in Designated Areas:
                        </p>
                        <span className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300 font-bold px-2 py-0.5 rounded-md">
                          App-Wide Sync Restricted
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                        <label className="flex items-center gap-2.5 p-2.5 rounded-lg bg-background border cursor-pointer hover:bg-muted/30 transition-colors">
                          <input
                            type="checkbox"
                            checked={settings.logoPlacement.applyToNav}
                            onChange={(e) => setSettings({
                              ...settings,
                              logoPlacement: { ...settings.logoPlacement, applyToNav: e.target.checked }
                            })}
                            className="rounded border-gray-300 text-primary focus:ring-primary/20"
                          />
                          <div>
                            <span className="font-semibold block">Sidebar & Navigation</span>
                            <span className="text-[10px] text-muted-foreground">Keep unchecked for clean native logo</span>
                          </div>
                        </label>

                        <label className="flex items-center gap-2.5 p-2.5 rounded-lg bg-background border cursor-pointer hover:bg-muted/30 transition-colors">
                          <input
                            type="checkbox"
                            checked={settings.logoPlacement.applyToLogin}
                            onChange={(e) => setSettings({
                              ...settings,
                              logoPlacement: { ...settings.logoPlacement, applyToLogin: e.target.checked }
                            })}
                            className="rounded border-gray-300 text-primary focus:ring-primary/20"
                          />
                          <div>
                            <span className="font-semibold block">Login Portal</span>
                            <span className="text-[10px] text-muted-foreground">Sign-in page branding</span>
                          </div>
                        </label>

                        <label className="flex items-center gap-2.5 p-2.5 rounded-lg bg-background border cursor-pointer hover:bg-muted/30 transition-colors">
                          <input
                            type="checkbox"
                            checked={settings.logoPlacement.applyToPortal}
                            onChange={(e) => setSettings({
                              ...settings,
                              logoPlacement: { ...settings.logoPlacement, applyToPortal: e.target.checked }
                            })}
                            className="rounded border-gray-300 text-primary focus:ring-primary/20"
                          />
                          <div>
                            <span className="font-semibold block">Candidate Portal</span>
                            <span className="text-[10px] text-muted-foreground">Assessment test runner</span>
                          </div>
                        </label>

                        <label className="flex items-center gap-2.5 p-2.5 rounded-lg bg-background border cursor-pointer hover:bg-muted/30 transition-colors">
                          <input
                            type="checkbox"
                            checked={settings.logoPlacement.applyToReports}
                            onChange={(e) => setSettings({
                              ...settings,
                              logoPlacement: { ...settings.logoPlacement, applyToReports: e.target.checked }
                            })}
                            className="rounded border-gray-300 text-primary focus:ring-primary/20"
                          />
                          <div>
                            <span className="font-semibold block">PDF Reports & Registers</span>
                            <span className="text-[10px] text-muted-foreground">Official document exports</span>
                          </div>
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground pt-1 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                      <span>Restrictions off: Custom logo is applied globally across all screens and portals.</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Layout className="w-4 h-4" />
                  Primary Theme Color
                </label>
                <div className="flex gap-3">
                  <input 
                    type="color"
                    className="w-12 h-10 p-1 bg-background border rounded-lg cursor-pointer"
                    value={settings.primaryColor}
                    onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                  />
                  <input 
                    type="text"
                    className="flex-1 px-4 py-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                    value={settings.primaryColor}
                    onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t">
              <button 
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                <span>Save Branding Settings</span>
              </button>
            </div>
          </div>

          {/* Server & Environment Isolation Card */}
          <div className="bg-card p-6 rounded-2xl border shadow-sm space-y-6 mt-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-foreground">
                <Server className="w-5 h-5 text-primary" />
                <div>
                  <h2 className="text-xl font-bold">Server & Environment Isolation</h2>
                  <p className="text-xs text-muted-foreground">Keep data, transactions, branding, and reports isolated to this hosting environment</p>
                </div>
              </div>
              <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${
                envInfo.isProduction
                  ? 'bg-blue-50 text-blue-700 border-blue-200' 
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}>
                {envInfo.name}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-muted/30 border space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Detected Host:</span>
                <span className="font-mono font-medium">{envInfo.hostname}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Isolation Scope ID:</span>
                <span className="font-mono font-bold text-primary">{envInfo.id}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Data Separation:</span>
                <span className="text-emerald-600 font-semibold flex items-center gap-1">
                  <Database className="w-3.5 h-3.5" /> Strictly Isolated
                </span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              When hosting this application across multiple separate servers or local laptops, updates to 
              branding, templates, transactions, and reports on this device will only sync within this specific environment. 
              They will never alter or overwrite data on your other server deployments.
            </p>

            {isAdmin && (
              <div className="pt-3 border-t space-y-3">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                  Custom Environment / Client Scope ID
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customEnvId}
                    onChange={(e) => setCustomEnvId(e.target.value)}
                    placeholder="e.g. client_branch_a, local, production"
                    className="flex-1 px-3 py-2 text-sm bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 font-mono"
                  />
                  <button
                    onClick={handleUpdateEnv}
                    disabled={savingEnv || customEnvId === envInfo.id}
                    className="px-4 py-2 bg-secondary text-secondary-foreground text-xs font-semibold rounded-lg hover:bg-secondary/80 disabled:opacity-50 transition-colors"
                  >
                    {savingEnv ? 'Switching...' : 'Switch Scope'}
                  </button>
                  {customEnvId !== 'auto' && (
                    <button
                      onClick={() => {
                        environmentService.setEnvironmentId(null);
                        window.location.reload();
                      }}
                      className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground border rounded-lg transition-colors"
                      title="Reset to automatic detection"
                    >
                      Reset to Auto
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  By default, the environment is automatically detected from the hostname (e.g. "local" for laptop localhost, or domain name for separate servers).
                </p>
              </div>
            )}
          </div>

          {isAdmin && (
            <div className="bg-destructive/5 p-6 rounded-2xl border border-destructive/20 shadow-sm space-y-6 mt-8">
              <div className="flex items-center gap-3 text-destructive">
                <AlertTriangle className="w-6 h-6" />
                <h2 className="text-xl font-bold">System Maintenance</h2>
              </div>
              
              <div className="space-y-2">
                <p className="text-sm font-medium">Reset Application Data</p>
                <p className="text-xs text-muted-foreground">
                  Deleting all transactional data will reset all counters to zero. This includes all submissions, appraisals, evaluations, assignments, audit logs, and notifications. 
                  <span className="font-bold block mt-1">Templates, Users, Departments, and Roles will not be affected.</span>
                </p>
              </div>

              <div className="pt-4 border-t border-destructive/10">
                <button 
                  onClick={() => setShowResetModal(true)}
                  disabled={resetting}
                  className="flex items-center gap-2 px-6 py-2 bg-destructive text-destructive-foreground rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  <span>Reset All Transactional Data</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-card p-6 rounded-2xl border shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Preview</h3>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                settings.restrictAcrossApp 
                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                  : 'bg-blue-100 text-blue-800 border border-blue-200'
              }`}>
                {settings.restrictAcrossApp ? 'Restricted (Not Across Entire App)' : 'App-Wide'}
              </span>
            </div>
            
            <div className="space-y-6">
              <div className="p-4 border rounded-xl bg-background flex items-center justify-between gap-3">
                <BrandLogo 
                  size="md" 
                  showAppName 
                  customLogoUrl={settings.logoUrl} 
                  customAppName={settings.appName}
                  appNameClassName="text-base font-bold"
                  area="preview"
                />
              </div>

              <div className="p-4 border rounded-xl bg-background space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Header / Banner View</p>
                <div className="p-4 rounded-xl border flex items-center gap-4 bg-muted/20">
                  <BrandLogo 
                    size="lg" 
                    customLogoUrl={settings.logoUrl} 
                    customAppName={settings.appName}
                    area="preview"
                  />
                  <div>
                    <h4 className="text-base font-bold text-foreground leading-tight">
                      {settings.appName || 'AssessPro'}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {settings.companyName || 'Enterprise Performance & Compliance'}
                    </p>
                  </div>
                </div>
              </div>

              {settings.restrictAcrossApp && (
                <div className="p-3 bg-muted/40 rounded-xl border text-xs space-y-2">
                  <p className="font-semibold text-muted-foreground">Active Placement Rule:</p>
                  <ul className="space-y-1 text-[11px]">
                    <li className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${settings.logoPlacement.applyToNav ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                      <span>Sidebar Navigation: {settings.logoPlacement.applyToNav ? 'Custom Logo' : 'Native Default (Shield)'}</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${settings.logoPlacement.applyToLogin ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                      <span>Login Portal: {settings.logoPlacement.applyToLogin ? 'Custom Logo' : 'Native Default (Shield)'}</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${settings.logoPlacement.applyToPortal ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                      <span>Assessment Portal: {settings.logoPlacement.applyToPortal ? 'Custom Logo' : 'Native Default (Shield)'}</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${settings.logoPlacement.applyToReports ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                      <span>PDF Reports & Registers: {settings.logoPlacement.applyToReports ? 'Custom Logo' : 'Native Default'}</span>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 bg-muted/60 border rounded-xl text-xs space-y-2">
            <p className="font-bold text-foreground flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-primary" />
              Environment & App Scope:
            </p>
            <p className="text-muted-foreground">
              Branding changes are isolated to this environment (<strong>{envInfo.name}</strong>). With app-wide restriction enabled, your uploaded logo will not replace interface elements across the whole platform.
            </p>
          </div>
        </div>
      </div>
      {/* Reset Data Confirmation Modal */}
      {showResetModal && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-md rounded-2xl border border-destructive/20 shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-destructive">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-bold">Confirm Transactional Data Reset</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Are you absolutely sure? This will delete all submissions, appraisals, evaluations, assignments, training registers, and logs. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={resetting}
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetting}
                onClick={handleResetData}
                className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
              >
                {resetting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Confirm Reset</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
