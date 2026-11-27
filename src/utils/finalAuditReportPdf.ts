import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatAuditTimestamp, formatIsoDateOnly, normalizeSyMetricText } from '../lib/utils';
import { EnrichedAuditLog, LifecycleReportSummary } from './auditLifecycle';
import { BrandingInfo, drawPdfBrandingHeader, sanitizeReportBrandName } from './pdfBranding';

export interface AuditReportPdfRow {
  step: number;
  stage: string;
  timestamp: string;
  action: string;
  why?: string;
  changes?: string;
  performedByName: string;
  performedByEmployeeId: string;
  performedByEmail: string;
}

interface AuditReportPdfData {
  title: string;
  createdDate: string;
  initiatedByDisplay: string;
  status: string;
  transactionId: string;
  generatedDate: string;
  rows: AuditReportPdfRow[];
}

function drawAuditStepMarker(doc: jsPDF, x: number, y: number, stage: string, action: string) {
  const act = action.toLowerCase();
  const st = stage.toLowerCase();

  if (st === 'closing' || act.includes('completed') || act.includes('closed')) {
    // Emerald filled circle with crisp check
    doc.setFillColor(22, 163, 74);
    doc.circle(x + 2, y - 1, 2, 'F');
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.45);
    doc.line(x + 1.1, y - 0.9, x + 1.8, y - 0.2);
    doc.line(x + 1.8, y - 0.2, x + 3.0, y - 1.7);
  } else if (st.includes('signature') || act.includes('signed')) {
    // Green-teal signature nib square
    doc.setDrawColor(16, 185, 129);
    doc.setFillColor(236, 253, 245);
    doc.roundedRect(x + 0.2, y - 2.9, 3.6, 3.6, 0.5, 0.5, 'FD');
    doc.setDrawColor(5, 150, 105);
    doc.setLineWidth(0.35);
    doc.line(x + 1.0, y - 0.3, x + 3.0, y - 2.1);
  } else if (act.includes('email') || act.includes('notif') || act.includes('assigned') || act.includes('started signing')) {
    // Blue envelope/dispatch icon
    doc.setDrawColor(2, 132, 199);
    doc.setFillColor(240, 249, 255);
    doc.roundedRect(x + 0.1, y - 2.6, 3.8, 2.9, 0.3, 0.3, 'FD');
    doc.line(x + 0.2, y - 2.5, x + 2.0, y - 1.0);
    doc.line(x + 2.0, y - 1.0, x + 3.8, y - 2.5);
  } else {
    // Warm amber/slate document icon matching reference layout
    doc.setDrawColor(194, 65, 12);
    doc.setFillColor(255, 247, 237);
    doc.rect(x + 0.5, y - 3.0, 3.0, 3.6, 'FD');
    doc.setDrawColor(194, 65, 12);
    doc.setLineWidth(0.25);
    doc.line(x + 1.1, y - 1.9, x + 2.9, y - 1.9);
    doc.line(x + 1.1, y - 1.1, x + 2.9, y - 1.1);
    doc.line(x + 1.1, y - 0.3, x + 2.3, y - 0.3);
  }
}

async function renderFinalAuditReportDocument(
  data: AuditReportPdfData,
  filename: string,
  branding?: BrandingInfo
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const companyName = sanitizeReportBrandName(branding?.companyName) || 'SyMetric Systems';

  // Top branding strip (sanitized, preserves logo aspect ratio)
  const headerRes = await drawPdfBrandingHeader(doc, branding, {
    margin,
    topY: 10,
    hideAppName: true,
    rightHeaderText: 'FINAL AUDIT REPORT'
  });

  let curY = headerRes.nextY + 2;

  // Large Sky-Blue Document Title (matching reference screenshot)
  const cleanTitle = normalizeSyMetricText(sanitizeReportBrandName(data.title)) || 'Audit Report';
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(19);
  doc.setTextColor(2, 132, 199); // #0284c7
  const titleLines = doc.splitTextToSize(cleanTitle, contentWidth);
  doc.text(titleLines, margin, curY);
  curY += titleLines.length * 7.5 + 1;

  // Sub-header row: "Final Audit Report" left, Date right
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('Final Audit Report', margin, curY);
  doc.text(data.generatedDate, pageWidth - margin, curY, { align: 'right' });
  curY += 4.5;

  // Light-gray bordered metadata box: Created / By / Status / Transaction ID
  const boxTopY = curY;
  const labelWidth = 34;
  const valWidth = contentWidth - labelWidth - 8;
  const byLines = doc.splitTextToSize(normalizeSyMetricText(data.initiatedByDisplay), valWidth);
  const statusLines = doc.splitTextToSize(normalizeSyMetricText(data.status), valWidth);
  const txLines = doc.splitTextToSize(data.transactionId || 'N/A', valWidth);

  const rowHeight = 5.5;
  const boxHeight =
    6 +
    rowHeight + // Created
    Math.max(rowHeight, byLines.length * 4.5 + 1.5) + // By
    Math.max(rowHeight, statusLines.length * 4.5 + 1.5) + // Status
    Math.max(rowHeight, txLines.length * 4.5 + 1.5) + // Transaction ID
    3;

  doc.setFillColor(243, 244, 246); // #f3f4f6
  doc.setDrawColor(51, 65, 85); // #334155
  doc.setLineWidth(0.35);
  doc.rect(margin, boxTopY, contentWidth, boxHeight, 'FD');

  let metaY = boxTopY + 6;
  const drawMetaRow = (label: string, valueLines: string[]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text(label, margin + 4, metaY);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(valueLines, margin + 4 + labelWidth, metaY);
    metaY += Math.max(rowHeight, valueLines.length * 4.5 + 1.5);
  };

  drawMetaRow('Created:', [data.createdDate || 'N/A']);
  drawMetaRow('By:', byLines);
  drawMetaRow('Status:', statusLines);
  drawMetaRow('Transaction ID:', txLines);

  curY = boxTopY + boxHeight + 10;

  // "<Report Title>" History section
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13.5);
  doc.setTextColor(15, 23, 42);
  const historyHeadingLines = doc.splitTextToSize(`"${cleanTitle}" History`, contentWidth);
  doc.text(historyHeadingLines, margin, curY);
  curY += historyHeadingLines.length * 6 + 3;

  // Chronological visual timeline rows (Adobe Sign–style clean log feed)
  for (const row of data.rows) {
    const stepHeadline = `Step ${String(row.step).padStart(2, '0')} [${row.stage}] — ${normalizeSyMetricText(row.action)}`;
    const performerSub = `Performed By: ${normalizeSyMetricText(row.performedByName)} | Employee ID: ${row.performedByEmployeeId} | Email ID: ${row.performedByEmail}`;
    const timeSub = `${row.timestamp}${row.why ? ` — ${normalizeSyMetricText(row.why)}` : ''}`;
    const changeSub = row.changes ? `Changes: ${normalizeSyMetricText(row.changes)}` : '';

    const headlineLines = doc.splitTextToSize(stepHeadline, contentWidth - 9);
    const performerLines = doc.splitTextToSize(performerSub, contentWidth - 9);
    const timeLines = doc.splitTextToSize(timeSub, contentWidth - 9);
    const changeLines = changeSub ? doc.splitTextToSize(changeSub, contentWidth - 9) : [];
    const blockHeight =
      headlineLines.length * 4.2 +
      performerLines.length * 3.8 +
      timeLines.length * 3.6 +
      (changeLines.length > 0 ? changeLines.length * 3.6 + 1 : 0) +
      4.5;

    if (curY + blockHeight > pageHeight - 20) {
      doc.addPage();
      curY = 16;
    }

    drawAuditStepMarker(doc, margin, curY, row.stage, row.action);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(15, 23, 42);
    doc.text(headlineLines, margin + 7, curY);
    curY += headlineLines.length * 4.2;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(performerLines, margin + 7, curY);
    curY += performerLines.length * 3.8;

    doc.setFont('courier', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(timeLines, margin + 7, curY);
    curY += timeLines.length * 3.6;

    if (changeLines.length > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(21, 128, 61);
      doc.text(changeLines, margin + 7, curY + 0.5);
      curY += changeLines.length * 3.6 + 1;
    }

    curY += 3.5;
  }

  // Structured tabular register of Steps, Stage, Timestamp, Action & Changes, Performed By Employee ID, Performed By Email ID
  curY += 3;
  if (curY > pageHeight - 40) {
    doc.addPage();
    curY = 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Structured Audit Steps & Changes Breakdown', margin, curY);
  curY += 3;

  autoTable(doc, {
    startY: curY,
    margin: { left: margin, right: margin, bottom: 16 },
    head: [[
      'Step',
      'Stage',
      'Timestamp',
      'Action & Changes',
      'Performed By',
      'Performed By Employee ID',
      'Performed By Email ID'
    ]],
    body: data.rows.map((r) => [
      String(r.step).padStart(2, '0'),
      r.stage,
      r.timestamp,
      r.changes
        ? `${normalizeSyMetricText(r.action)}\nChanges: ${normalizeSyMetricText(r.changes)}`
        : normalizeSyMetricText(r.action),
      normalizeSyMetricText(r.performedByName),
      r.performedByEmployeeId,
      r.performedByEmail
    ]),
    styles: {
      fontSize: 7.3,
      cellPadding: 2.2,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
      overflow: 'linebreak',
      valign: 'top'
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 7.3
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 21 },
      2: { cellWidth: 30, font: 'courier', fontSize: 6.8 },
      3: { cellWidth: 46 },
      4: { cellWidth: 23 },
      5: { cellWidth: 19, font: 'courier' },
      6: { cellWidth: 33, font: 'courier', fontSize: 6.8 }
    }
  });

  // Consistent footers on every page
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`${companyName} • Final Audit Report`, margin, pageHeight - 7);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 7, { align: 'right' });
  }

  doc.save(filename);
}

export async function generateFinalAuditReportPdf(
  summary: LifecycleReportSummary,
  branding?: BrandingInfo
): Promise<void> {
  const initiatorParts = [normalizeSyMetricText(summary.initiatedBy.name)];
  if (summary.initiatedBy.employeeId) initiatorParts.push(`[${summary.initiatedBy.employeeId}]`);
  if (summary.initiatedBy.email) initiatorParts.push(`(${summary.initiatedBy.email})`);

  const rows: AuditReportPdfRow[] = summary.events.map((ev, idx) => ({
    step: idx + 1,
    stage: ev.stage,
    timestamp: ev.timestamp ? formatAuditTimestamp(ev.timestamp) : 'N/A',
    action: ev.action,
    why: ev.why,
    changes:
      Array.isArray(ev.changes) && ev.changes.length > 0
        ? ev.changes.map((c) => `${c.field}: ${String(c.from ?? '—')} -> ${String(c.to ?? '—')}`).join(' | ')
        : undefined,
    performedByName: ev.actor.name || 'System',
    performedByEmployeeId: ev.actor.employeeId || '—',
    performedByEmail: ev.actor.email || '—'
  }));

  const safeId = (summary.entityId || 'report').replace(/[^a-zA-Z0-9_-]/g, '_');
  await renderFinalAuditReportDocument(
    {
      title: summary.entityTitle || 'Audit Report',
      createdDate: formatIsoDateOnly(summary.initiatedBy.timestamp || summary.events[0]?.timestamp),
      initiatedByDisplay: initiatorParts.join(' '),
      status: summary.currentStatus,
      transactionId: summary.entityId,
      generatedDate: formatIsoDateOnly(new Date()),
      rows
    },
    `final_audit_report_${safeId}_${formatIsoDateOnly(new Date())}.pdf`,
    branding
  );
}

export async function generateAuditLogsListPdf(
  logs: EnrichedAuditLog[],
  reportTitle: string,
  branding?: BrandingInfo,
  options?: {
    transactionId?: string;
    status?: string;
    filenamePrefix?: string;
  }
): Promise<void> {
  const chronological = [...logs].sort(
    (a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()
  );

  const first = chronological[0];
  const initiator = first?.initiatedBy || first?.actor;
  const initiatorParts = initiator ? [normalizeSyMetricText(initiator.name)] : ['System'];
  if (initiator?.employeeId) initiatorParts.push(`[${initiator.employeeId}]`);
  if (initiator?.email) initiatorParts.push(`(${initiator.email})`);

  const rows: AuditReportPdfRow[] = chronological.map((log, idx) => ({
    step: idx + 1,
    stage: log.stage,
    timestamp: log.timestamp ? formatAuditTimestamp(log.timestamp) : 'N/A',
    action: log.entityTitle ? `${log.action} — ${log.entityTitle}` : log.action,
    why: log.why,
    changes:
      Array.isArray(log.changes) && log.changes.length > 0
        ? log.changes.map((c) => `${c.field}: ${String(c.from ?? '—')} -> ${String(c.to ?? '—')}`).join(' | ')
        : undefined,
    performedByName: log.actor.name || 'System',
    performedByEmployeeId: log.actor.employeeId || '—',
    performedByEmail: log.actor.email || '—'
  }));

  const prefix = options?.filenamePrefix || 'final_audit_report';
  await renderFinalAuditReportDocument(
    {
      title: reportTitle,
      createdDate: first?.timestamp ? formatIsoDateOnly(first.timestamp) : formatIsoDateOnly(new Date()),
      initiatedByDisplay: initiatorParts.join(' '),
      status: options?.status || `${rows.length} Verified Audit Event${rows.length === 1 ? '' : 's'}`,
      transactionId: options?.transactionId || `AUDIT-${formatIsoDateOnly(new Date()).replace(/-/g, '')}-${rows.length}`,
      generatedDate: formatIsoDateOnly(new Date()),
      rows
    },
    `${prefix}_${formatIsoDateOnly(new Date())}.pdf`,
    branding
  );
}
