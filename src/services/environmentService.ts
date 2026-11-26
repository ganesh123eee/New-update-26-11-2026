/**
 * Environment & Server Isolation Service
 *
 * Ensures that each server, client, or local laptop installation isolates its own:
 * - Branding (Logo, App Name, Company Name)
 * - Transactions (Assignments, Submissions, Reviews)
 * - Templates and Training Registers
 * - Reports and Audit Logs
 *
 * When hosted on a separate server or run on a local laptop, data changes
 * are scoped strictly to that environment and never overwrite other instances.
 */

export interface EnvironmentInfo {
  id: string;
  name: string;
  isProduction: boolean;
  isLocal: boolean;
  hostname: string;
}

export const environmentService = {
  getEnvironmentId(): string {
    // 1. Manual override in localStorage (configured via Admin UI)
    try {
      const stored = localStorage.getItem('assesspro_environment_id');
      if (stored && stored.trim()) {
        return stored.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
      }
    } catch {}

    // 2. Environment variable override (VITE_APP_ENV in .env)
    const envVar = (import.meta as any).env?.VITE_APP_ENV;
    if (envVar && typeof envVar === 'string' && envVar.trim()) {
      return envVar.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    }

    // 3. Automatic detection by hostname
    if (typeof window !== 'undefined' && window.location) {
      const host = window.location.hostname.toLowerCase();

      // Local laptop / development machine
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0' ||
        host.startsWith('192.168.') ||
        host.startsWith('10.') ||
        host.endsWith('.local')
      ) {
        return 'local';
      }

      // Isolated preview / development container
      if (host.includes('ais-dev-')) {
        return 'dev_preview';
      }

      // Isolated staging preview container
      if (host.includes('ais-pre-')) {
        return 'staging_preview';
      }

      // Primary production server (trg.symetricc6.com)
      if (host.includes('trg.') || host.includes('symetric')) {
        return 'production';
      }

      // Custom domain for a separate server / client
      const sanitized = host.replace(/[^a-z0-9]/g, '_');
      return sanitized || 'production';
    }

    return 'production';
  },

  getEnvironmentInfo(): EnvironmentInfo {
    const id = this.getEnvironmentId();
    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'unknown';

    let name = 'Production Server';
    if (id === 'local') {
      name = 'Local Laptop / Development';
    } else if (id === 'dev_preview') {
      name = 'Development Preview (Isolated)';
    } else if (id === 'staging_preview') {
      name = 'Staging Preview (Isolated)';
    } else if (id === 'production') {
      name = 'Primary Server (Production)';
    } else {
      name = `Isolated Server (${id})`;
    }

    return {
      id,
      name,
      isProduction: id === 'production',
      isLocal: id === 'local',
      hostname
    };
  },

  setEnvironmentId(newId: string | null) {
    try {
      if (!newId || newId.trim() === '' || newId.trim() === 'auto') {
        localStorage.removeItem('assesspro_environment_id');
      } else {
        const sanitized = newId.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
        localStorage.setItem('assesspro_environment_id', sanitized);
      }
    } catch {}
  },

  /**
   * Scopes a collection name to the active environment.
   * - In production: returns standard base name (e.g., 'templates', 'submissions')
   * - In local/custom: returns scoped name (e.g., 'templates_local', 'submissions_local')
   */
  getScopedCollectionName(baseCollection: string): string {
    const envId = this.getEnvironmentId();
    if (envId === 'production') {
      return baseCollection;
    }
    return `${baseCollection}_${envId}`;
  },

  /**
   * Scopes a document path. For settings like branding:
   * - In production: doc('settings', 'branding')
   * - In local/custom: doc('settings', 'branding_local')
   */
  getScopedDocPath(baseCollection: string, docId: string): { collection: string; docId: string } {
    const envId = this.getEnvironmentId();
    if (envId === 'production') {
      return { collection: baseCollection, docId };
    }

    if (baseCollection === 'settings') {
      return { collection: 'settings', docId: `${docId}_${envId}` };
    }

    return { collection: `${baseCollection}_${envId}`, docId };
  }
};
