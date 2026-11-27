import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date) {
  if (!date) return 'N/A';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

export function formatDateTime(date: string | Date) {
  if (!date) return 'N/A';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return 'N/A';
  const day = String(d.getDate()).padStart(2, '0');
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}-${month}-${year} ${hours}:${minutes}`;
}

export function formatIsoDateOnly(date?: string | Date | null): string {
  if (!date) return 'N/A';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return 'N/A';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatAuditTimestamp(date?: string | Date | null): string {
  if (!date) return 'N/A';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return 'N/A';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const rawHours = d.getHours();
  const ampm = rawHours >= 12 ? 'PM' : 'AM';
  const hours12 = String(rawHours % 12 || 12).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} - ${hours12}:${minutes}:${seconds} ${ampm}`;
}

export function formatSignatureDate(date: string | Date) {
  if (!date) return 'N/A';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}-${month}-${year} ${hours}:${minutes}`;
}

export function formatId(id: string | undefined, prefix: string) {
  if (!id) return 'N/A';
  // Take last 6 characters and uppercase them, prefix with the type
  const shortId = id.slice(-6).toUpperCase();
  return `${prefix}-${shortId}`;
}

export function formatQuestionnaireVersion(version?: string | null): string {
  if (!version) return '';
  const trimmed = String(version).trim();
  if (!trimmed) return '';
  const normalized = trimmed.toLowerCase().replace(/\s+/g, ' ');
  if (
    normalized === 'v1.0' ||
    normalized === 'version 1.0' ||
    normalized === '1.0' ||
    normalized === 'v 1.0'
  ) {
    return '';
  }
  return trimmed;
}

export function normalizeSyMetricText(text?: string | null): string {
  if (!text) return '';
  return String(text).replace(/symetric/gi, 'SyMetric');
}

