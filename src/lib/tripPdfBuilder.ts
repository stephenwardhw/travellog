import { jsPDF } from 'jspdf';

export interface PdfTripLike {
  clientId: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  description: string;
  startLocationName?: string | null;
  startLatitude?: number | null;
  startLongitude?: number | null;
  endLocationName?: string | null;
  endLatitude?: number | null;
  endLongitude?: number | null;
  targetBudget?: number | null;
  budgetCurrency?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  accessRole?: string | null;
}

export interface PdfEventLike {
  clientId: string;
  eventDate: string;
  eventTime?: string | null;
  location: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  details?: string | null;
  journalEntry?: string | null;
}

export interface PdfBookingLike {
  clientId: string;
  name: string;
  checkInDate: string;
  checkOutDate: string;
  status?: string | null;
  confirmationCode?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string | null;
}

export interface PdfExpenseLike {
  clientId: string;
  title: string;
  amount: number;
  currency?: string | null;
  expenseDate: string;
  category: string;
  paymentMethod: string;
  notes?: string | null;
}

export interface PdfPhotoLike {
  clientId: string;
  filename: string;
  mimeType?: string | null;
  sizeBytes?: number;
  caption?: string | null;
  diskPath?: string | null;
  thumbDiskPath?: string | null;
  blob?: Blob;
  thumbBlob?: Blob;
}

export interface PdfDocLike {
  clientId: string;
  filename: string;
  sizeBytes: number;
}

export interface PdfReportOptions {
  includeBookings?: boolean;
  includeBudget?: boolean;
  includeDetails?: boolean;
  includeJournal?: boolean;
  includeCoords?: boolean;
  includePhotos?: boolean;
  includePdfs?: boolean;
  generatedByLabel?: string;
}

export interface ResolvedPdfImage {
  bytes: Uint8Array;
  format: 'JPEG' | 'PNG';
}

export interface BuildTripReportPdfInput {
  trip: PdfTripLike;
  events: PdfEventLike[];
  bookings?: PdfBookingLike[];
  expenses?: PdfExpenseLike[];
  photosByEvent?: Map<string, PdfPhotoLike[]>;
  photosByBooking?: Map<string, PdfPhotoLike[]>;
  pdfsByEvent?: Map<string, PdfDocLike[]>;
  pdfsByBooking?: Map<string, PdfDocLike[]>;
  options?: PdfReportOptions;
  resolvePhotoImage?: (photo: PdfPhotoLike) => Promise<ResolvedPdfImage | null>;
  onProgress?: (status: string) => void;
}

export function pdfSafeText(input: string | null | undefined): string {
  const normalized = (input || '')
    .replace(/\u2192/g, '->')
    .replace(/\u2190/g, '<-')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/[\u2022\u00b7]/g, '*')
    .replace(/\u00a0/g, ' ');

  // Helvetica built-in font supports WinAnsi/Latin-1 range cleanly; replace higher Unicode glyphs safely
  return normalized.replace(/[^\x09\x0a\x0d\x20-\xff]/g, '?');
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#039;/gi, "'")
    .replace(/&#(\d+);/g, (_m, code) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCharCode(n) : '';
    });
}

function htmlToStructuredLines(raw: string | null | undefined): string {
  const value = (raw || '').trim();
  if (!value) return '';

  const withLinks = value.replace(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_m, href: string, label: string) => {
      const cleanLabel = label.replace(/<[^>]+>/g, '').trim();
      if (!cleanLabel || cleanLabel === href) return href;
      return `${cleanLabel} (${href})`;
    }
  );

  const withBlocks = withLinks
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n  * ')
    .replace(/<\/(p|div|li|h1|h2|h3|h4|blockquote|pre|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  return pdfSafeText(decodeHtmlEntities(withBlocks))
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatLongDateUtc(iso: string): string {
  const [y, m, d] = (iso || '').split('-').map(Number);
  if (!y || !m || !d) return iso || '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function computeTripDayNumber(tripStartIso: string, dateIso: string): number | null {
  const [sy, sm, sd] = (tripStartIso || '').split('-').map(Number);
  const [dy, dm, dd] = (dateIso || '').split('-').map(Number);
  if (!sy || !sm || !sd || !dy || !dm || !dd) return null;
  const startUtc = Date.UTC(sy, sm - 1, sd);
  const dayUtc = Date.UTC(dy, dm - 1, dd);
  const diffDays = Math.round((dayUtc - startUtc) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 ? diffDays + 1 : null;
}

function formatMoneySafe(amount: number, currency = 'USD'): string {
  const safeCurrency = (currency || 'USD').toUpperCase();
  const formatted = Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${safeCurrency} ${formatted}`;
}

function formatBytesSafe(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function detectImageFormatFromBytes(bytes: Uint8Array): 'JPEG' | 'PNG' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'JPEG';
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'PNG';
  }
  return null;
}

export async function buildTripReportPdf(input: BuildTripReportPdfInput): Promise<Uint8Array> {
  const opts: Required<PdfReportOptions> = {
    includeBookings: input.options?.includeBookings ?? true,
    includeBudget: input.options?.includeBudget ?? true,
    includeDetails: input.options?.includeDetails ?? true,
    includeJournal: input.options?.includeJournal ?? true,
    includeCoords: input.options?.includeCoords ?? true,
    includePhotos: input.options?.includePhotos ?? true,
    includePdfs: input.options?.includePdfs ?? true,
    generatedByLabel: input.options?.generatedByLabel ?? 'TravelLog',
  };

  const trip = input.trip;
  const photosByEvent = input.photosByEvent || new Map<string, PdfPhotoLike[]>();
  const photosByBooking = input.photosByBooking || new Map<string, PdfPhotoLike[]>();
  const pdfsByEvent = input.pdfsByEvent || new Map<string, PdfDocLike[]>();
  const pdfsByBooking = input.pdfsByBooking || new Map<string, PdfDocLike[]>();

  const chronologicalEvents = [...input.events].sort((a, b) => {
    const dateCmp = (a.eventDate || '').localeCompare(b.eventDate || '');
    if (dateCmp !== 0) return dateCmp;
    return (a.eventTime || '').localeCompare(b.eventTime || '');
  });

  const sortedBookings = [...(input.bookings || [])].sort((a, b) =>
    (a.checkInDate || '').localeCompare(b.checkInDate || '')
  );

  const sortedExpenses = [...(input.expenses || [])].sort((a, b) =>
    (a.expenseDate || '').localeCompare(b.expenseDate || '')
  );

  const groupedByDate = new Map<string, PdfEventLike[]>();
  for (const ev of chronologicalEvents) {
    const list = groupedByDate.get(ev.eventDate) || [];
    list.push(ev);
    groupedByDate.set(ev.eventDate, list);
  }
  const dayEntries = Array.from(groupedByDate.entries());

  let photoCount = 0;
  let pdfCount = 0;
  for (const ev of chronologicalEvents) {
    photoCount += photosByEvent.get(ev.clientId)?.length || 0;
    pdfCount += pdfsByEvent.get(ev.clientId)?.length || 0;
  }
  for (const bk of sortedBookings) {
    photoCount += photosByBooking.get(bk.clientId)?.length || 0;
    pdfCount += pdfsByBooking.get(bk.clientId)?.length || 0;
  }

  // Pre-resolve embeddable photos if needed
  const resolvedImages = new Map<string, ResolvedPdfImage>();
  if (opts.includePhotos && input.resolvePhotoImage) {
    const allPhotos: PdfPhotoLike[] = [
      ...(opts.includeBookings
        ? sortedBookings.flatMap((bk) => photosByBooking.get(bk.clientId) || [])
        : []),
      ...chronologicalEvents.flatMap((ev) => photosByEvent.get(ev.clientId) || []),
    ];

    for (let i = 0; i < allPhotos.length; i++) {
      const p = allPhotos[i];
      input.onProgress?.(`Preparing PDF photos (${i + 1} / ${allPhotos.length})...`);
      try {
        const resolved = await input.resolvePhotoImage(p);
        if (resolved && resolved.bytes.length > 0) {
          resolvedImages.set(p.clientId, resolved);
        }
      } catch {
        // Skip unreadable photo cleanly without failing PDF export
      }
    }
  }

  input.onProgress?.('Composing PDF pages...');

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
    compress: true,
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 612
  const pageHeight = doc.internal.pageSize.getHeight(); // 792
  const marginX = 42;
  const topMargin = 48;
  const bottomMargin = 48;
  const contentWidth = pageWidth - marginX * 2; // 528

  let y = topMargin;

  const drawRunningHeader = () => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(pdfSafeText(trip.title).slice(0, 70), marginX, 26);
    doc.text(pdfSafeText(`${trip.startDate} - ${trip.endDate}`), pageWidth - marginX, 26, {
      align: 'right',
    });
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.6);
    doc.line(marginX, 32, pageWidth - marginX, 32);
  };

  const ensureSpace = (neededPt: number) => {
    if (y + neededPt > pageHeight - bottomMargin) {
      doc.addPage();
      drawRunningHeader();
      y = topMargin;
    }
  };

  const writeWrappedLines = (
    lines: string[],
    x: number,
    fontSize: number,
    lineHeight: number,
    color: [number, number, number],
    fontStyle: 'normal' | 'bold' | 'italic' = 'normal'
  ) => {
    doc.setFont('helvetica', fontStyle);
    doc.setFontSize(fontSize);
    doc.setTextColor(color[0], color[1], color[2]);
    for (const line of lines) {
      ensureSpace(lineHeight + 2);
      doc.text(line, x, y);
      y += lineHeight;
    }
  };

  const renderSectionBanner = (
    title: string,
    rightMeta: string,
    accentRgb: [number, number, number]
  ) => {
    ensureSpace(34);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(pdfSafeText(title), marginX, y);

    if (rightMeta) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(pdfSafeText(rightMeta), pageWidth - marginX, y, { align: 'right' });
    }

    y += 6;
    doc.setDrawColor(accentRgb[0], accentRgb[1], accentRgb[2]);
    doc.setLineWidth(1.5);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 14;
  };

  const renderPhotoGrid = (photos: PdfPhotoLike[]) => {
    if (!opts.includePhotos || photos.length === 0) return;

    const gap = 12;
    const cellW = (contentWidth - gap) / 2;
    const maxImgH = 158;

    for (let i = 0; i < photos.length; i += 2) {
      const pair = photos.slice(i, i + 2);

      // Pre-compute aspect-ratio-fitted heights so neither image is cropped and row aligns
      const measured = pair.map((p) => {
        const img = resolvedImages.get(p.clientId);
        let drawW = cellW;
        let drawH = 72;
        if (img) {
          try {
            const props = doc.getImageProperties(img.bytes);
            if (props.width > 0 && props.height > 0) {
              const scale = Math.min(cellW / props.width, maxImgH / props.height);
              drawW = props.width * scale;
              drawH = props.height * scale;
            }
          } catch {
            // Keep default placeholder dimensions
          }
        }
        return { photo: p, img, drawW, drawH };
      });

      const maxRowImgH = Math.max(...measured.map((m) => m.drawH));
      const rowTotalH = maxRowImgH + 22;
      ensureSpace(rowTotalH);

      const rowStartY = y;
      measured.forEach((item, colIdx) => {
        const cellX = marginX + colIdx * (cellW + gap);
        doc.setDrawColor(226, 232, 240);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(cellX, rowStartY, cellW, maxRowImgH + 16, 4, 4, 'FD');

        if (item.img) {
          const offsetX = cellX + (cellW - item.drawW) / 2;
          const offsetY = rowStartY + 4 + (maxRowImgH - item.drawH) / 2;
          try {
            doc.addImage(
              item.img.bytes,
              item.img.format,
              offsetX,
              offsetY,
              item.drawW,
              item.drawH,
              undefined,
              'MEDIUM'
            );
          } catch {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(8);
            doc.setTextColor(100, 116, 139);
            doc.text('Photo preview unavailable', cellX + cellW / 2, rowStartY + maxRowImgH / 2, {
              align: 'center',
            });
          }
        } else {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(8);
          doc.setTextColor(100, 116, 139);
          doc.text(
            pdfSafeText(`Image attached: ${item.photo.filename}`).slice(0, 42),
            cellX + cellW / 2,
            rowStartY + maxRowImgH / 2,
            { align: 'center' }
          );
        }

        const captionText = pdfSafeText(item.photo.caption || item.photo.filename);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        doc.text(captionText.slice(0, 52), cellX + 6, rowStartY + maxRowImgH + 12);
      });

      y = rowStartY + rowTotalH + 4;
    }
  };

  // === Cover Header ===
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 118, 110);
  doc.text('TRAVELLOG ITINERARY REPORT', marginX, y);
  y += 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(15, 23, 42);
  const titleLines = doc.splitTextToSize(pdfSafeText(trip.title), contentWidth) as string[];
  for (const line of titleLines) {
    doc.text(line, marginX, y);
    y += 25;
  }

  const metaParts: string[] = [];
  if (trip.destination) metaParts.push(trip.destination);
  metaParts.push(`${trip.startDate} to ${trip.endDate}`);
  if (trip.accessRole && trip.accessRole !== 'owner') {
    metaParts.push(`Shared by ${trip.ownerName || trip.ownerEmail || 'Owner'}`);
  } else if (trip.ownerName || trip.ownerEmail) {
    metaParts.push(`Owner: ${trip.ownerName || trip.ownerEmail}`);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  const metaLines = doc.splitTextToSize(pdfSafeText(metaParts.join('  |  ')), contentWidth) as string[];
  writeWrappedLines(metaLines, marginX, 10, 14, [71, 85, 105]);

  if (trip.startLocationName || trip.endLocationName) {
    const anchorParts: string[] = [];
    if (trip.startLocationName) {
      const coords =
        opts.includeCoords && trip.startLatitude != null && trip.startLongitude != null
          ? ` (${trip.startLatitude.toFixed(4)}, ${trip.startLongitude.toFixed(4)})`
          : '';
      anchorParts.push(`Start: ${trip.startLocationName}${coords}`);
    }
    if (trip.endLocationName) {
      const coords =
        opts.includeCoords && trip.endLatitude != null && trip.endLongitude != null
          ? ` (${trip.endLatitude.toFixed(4)}, ${trip.endLongitude.toFixed(4)})`
          : '';
      anchorParts.push(`End: ${trip.endLocationName}${coords}`);
    }
    const anchorLines = doc.splitTextToSize(
      pdfSafeText(anchorParts.join('  |  ')),
      contentWidth
    ) as string[];
    writeWrappedLines(anchorLines, marginX, 9, 13, [71, 85, 105]);
  }

  y += 4;

  // Trip Description Box
  if ((trip.description || '').trim()) {
    const descLines = doc.splitTextToSize(
      pdfSafeText(trip.description.trim()),
      contentWidth - 20
    ) as string[];
    const boxH = descLines.length * 13 + 14;
    ensureSpace(boxH + 8);
    doc.setFillColor(248, 250, 252);
    doc.rect(marginX, y, contentWidth, boxH, 'F');
    doc.setFillColor(15, 118, 110);
    doc.rect(marginX, y, 3, boxH, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    let dy = y + 14;
    for (const line of descLines) {
      doc.text(line, marginX + 12, dy);
      dy += 13;
    }
    y += boxH + 10;
  }

  // Summary Stats Strip
  ensureSpace(46);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.8);
  doc.line(marginX, y, pageWidth - marginX, y);
  const statItems = [
    ['LOGGED DAYS', String(dayEntries.length)],
    ['STOPS', String(chronologicalEvents.length)],
    ['STAYS', String(sortedBookings.length)],
    ['PHOTOS', String(photoCount)],
    ['DOCUMENTS', String(pdfCount)],
  ];
  const statColW = contentWidth / statItems.length;
  statItems.forEach(([label, val], idx) => {
    const sx = marginX + idx * statColW;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(label, sx, y + 14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(val, sx, y + 31);
  });
  y += 40;
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 18;

  // === Budget & Expenses Section ===
  const budgetCurrency = (trip.budgetCurrency || 'USD').toUpperCase();
  const totalSpent = sortedExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  if (opts.includeBudget && (trip.targetBudget != null || sortedExpenses.length > 0)) {
    const budgetMeta = `${
      trip.targetBudget != null
        ? `Target ${formatMoneySafe(trip.targetBudget, budgetCurrency)}  |  `
        : ''
    }Spent ${formatMoneySafe(totalSpent, budgetCurrency)}`;
    renderSectionBanner('Budget & Expenses', budgetMeta, [15, 118, 110]);

    if (sortedExpenses.length === 0) {
      writeWrappedLines(['No expenses logged yet.'], marginX, 9.5, 13, [100, 116, 139], 'italic');
      y += 6;
    } else {
      for (const ex of sortedExpenses) {
        const subLine = `${ex.expenseDate}  |  ${ex.category}  |  ${ex.paymentMethod}`;
        const titleWrapped = doc.splitTextToSize(
          pdfSafeText(ex.title),
          contentWidth - 110
        ) as string[];
        const noteLines = ex.notes
          ? (doc.splitTextToSize(pdfSafeText(ex.notes), contentWidth - 16) as string[])
          : [];
        const cardH = 16 + titleWrapped.length * 13 + noteLines.length * 11 + 10;
        ensureSpace(cardH + 4);

        doc.setDrawColor(226, 232, 240);
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(marginX, y, contentWidth, cardH, 4, 4, 'FD');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(pdfSafeText(subLine), marginX + 10, y + 13);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.text(
          pdfSafeText(formatMoneySafe(ex.amount, ex.currency || budgetCurrency)),
          pageWidth - marginX - 10,
          y + 22,
          { align: 'right' }
        );

        let cy = y + 27;
        for (const tl of titleWrapped) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(15, 23, 42);
          doc.text(tl, marginX + 10, cy);
          cy += 13;
        }
        for (const nl of noteLines) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(71, 85, 105);
          doc.text(nl, marginX + 10, cy);
          cy += 11;
        }

        y += cardH + 6;
      }
      y += 10;
    }
  }

  // === Accommodations & Stays Section ===
  if (opts.includeBookings && sortedBookings.length > 0) {
    renderSectionBanner(
      'Accommodations & Stays',
      `${sortedBookings.length} ${sortedBookings.length === 1 ? 'stay' : 'stays'}`,
      [67, 56, 202]
    );

    for (const bk of sortedBookings) {
      const bkPhotos = opts.includePhotos ? photosByBooking.get(bk.clientId) || [] : [];
      const bkPdfs = opts.includePdfs ? pdfsByBooking.get(bk.clientId) || [] : [];
      const isConfirmed = bk.status === 'confirmed';
      const notesText = htmlToStructuredLines(bk.notes);

      const metaPartsStay = [bk.confirmationCode ? `Confirmation #${bk.confirmationCode}` : '', bk.address || '']
        .filter(Boolean)
        .join('  |  ');
      const coordsText =
        opts.includeCoords && bk.latitude != null && bk.longitude != null
          ? `Coordinates: ${bk.latitude.toFixed(5)}, ${bk.longitude.toFixed(5)}`
          : '';

      const titleWrapped = doc.splitTextToSize(pdfSafeText(bk.name), contentWidth - 16) as string[];
      const addrWrapped = metaPartsStay
        ? (doc.splitTextToSize(pdfSafeText(metaPartsStay), contentWidth - 16) as string[])
        : [];
      const noteWrapped = notesText
        ? (doc.splitTextToSize(notesText, contentWidth - 20) as string[])
        : [];

      const estimatedHeaderH =
        24 + titleWrapped.length * 14 + addrWrapped.length * 12 + (coordsText ? 12 : 0) + 6;
      ensureSpace(estimatedHeaderH + Math.min(noteWrapped.length, 4) * 12);

      // Top metadata row with indigo bar
      doc.setFillColor(238, 242, 255);
      doc.rect(marginX, y, contentWidth, 18, 'F');
      doc.setFillColor(67, 56, 202);
      doc.rect(marginX, y, 3, 18, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(pdfSafeText(`${bk.checkInDate}  ->  ${bk.checkOutDate}`), marginX + 10, y + 12);

      doc.setTextColor(isConfirmed ? 67 : 180, isConfirmed ? 56 : 83, isConfirmed ? 202 : 9);
      doc.text(isConfirmed ? 'Confirmed' : 'Unconfirmed', pageWidth - marginX - 8, y + 12, {
        align: 'right',
      });
      y += 26;

      writeWrappedLines(titleWrapped, marginX + 4, 12, 15, [15, 23, 42], 'bold');
      if (addrWrapped.length > 0) {
        writeWrappedLines(addrWrapped, marginX + 4, 9, 12, [71, 85, 105]);
      }
      if (coordsText) {
        writeWrappedLines([coordsText], marginX + 4, 8.5, 12, [100, 116, 139]);
      }
      if (noteWrapped.length > 0) {
        y += 2;
        writeWrappedLines(noteWrapped, marginX + 8, 9.2, 12.5, [30, 41, 59]);
      }
      if (bkPhotos.length > 0) {
        y += 4;
        renderPhotoGrid(bkPhotos);
      }
      if (bkPdfs.length > 0) {
        const pdfLine = `Booking PDFs: ${bkPdfs
          .map((d) => `${d.filename} (${formatBytesSafe(d.sizeBytes)})`)
          .join('  |  ')}`;
        const pdfWrapped = doc.splitTextToSize(pdfSafeText(pdfLine), contentWidth - 10) as string[];
        writeWrappedLines(pdfWrapped, marginX + 4, 8.5, 11.5, [71, 85, 105]);
      }

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.line(marginX, y + 4, pageWidth - marginX, y + 4);
      y += 14;
    }
  }

  // === Day-by-Day Chronological Itinerary ===
  if (dayEntries.length === 0) {
    renderSectionBanner('Itinerary', '0 stops', [15, 118, 110]);
    writeWrappedLines(
      ['No stops or journal entries have been logged for this trip yet.'],
      marginX,
      10,
      14,
      [100, 116, 139],
      'italic'
    );
  } else {
    for (const [dateIso, dayEvents] of dayEntries) {
      const dayNum = computeTripDayNumber(trip.startDate, dateIso);
      const dayMeta = `${dayNum ? `Day ${dayNum}  |  ` : ''}${dayEvents.length} ${
        dayEvents.length === 1 ? 'stop' : 'stops'
      }`;
      renderSectionBanner(formatLongDateUtc(dateIso), dayMeta, [15, 118, 110]);

      for (const ev of dayEvents) {
        const evPhotos = opts.includePhotos ? photosByEvent.get(ev.clientId) || [] : [];
        const evPdfs = opts.includePdfs ? pdfsByEvent.get(ev.clientId) || [] : [];
        const detailsText = opts.includeDetails ? htmlToStructuredLines(ev.details) : '';
        const journalText = opts.includeJournal ? htmlToStructuredLines(ev.journalEntry) : '';

        const titleWrapped = doc.splitTextToSize(
          pdfSafeText(ev.location),
          contentWidth - 12
        ) as string[];
        const addrWrapped = ev.address
          ? (doc.splitTextToSize(pdfSafeText(ev.address), contentWidth - 12) as string[])
          : [];
        const detailWrapped = detailsText
          ? (doc.splitTextToSize(detailsText, contentWidth - 14) as string[])
          : [];
        const journalWrapped = journalText
          ? (doc.splitTextToSize(journalText, contentWidth - 24) as string[])
          : [];

        const minStopPreviewH =
          24 +
          titleWrapped.length * 14 +
          addrWrapped.length * 12 +
          Math.min(detailWrapped.length, 2) * 12;
        ensureSpace(minStopPreviewH);

        // Stop time + coordinates header strip
        doc.setFillColor(240, 253, 250);
        doc.rect(marginX, y, contentWidth, 17, 'F');
        doc.setFillColor(15, 118, 110);
        doc.rect(marginX, y, 3, 17, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 118, 110);
        doc.text(pdfSafeText(ev.eventTime || 'All day'), marginX + 10, y + 11.5);

        if (opts.includeCoords && ev.latitude != null && ev.longitude != null) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(100, 116, 139);
          doc.text(
            `${ev.latitude.toFixed(5)}, ${ev.longitude.toFixed(5)}`,
            pageWidth - marginX - 8,
            y + 11.5,
            { align: 'right' }
          );
        }
        y += 26;

        writeWrappedLines(titleWrapped, marginX + 4, 12, 15, [15, 23, 42], 'bold');
        if (addrWrapped.length > 0) {
          writeWrappedLines(addrWrapped, marginX + 4, 9, 12, [71, 85, 105]);
        }
        if (detailWrapped.length > 0) {
          y += 2;
          writeWrappedLines(detailWrapped, marginX + 4, 9.3, 12.5, [51, 65, 85]);
        }
        if (journalWrapped.length > 0) {
          y += 4;
          const jLabelLines = ['Journal Entry:'];
          writeWrappedLines(jLabelLines, marginX + 8, 8.5, 11.5, [15, 118, 110], 'bold');
          writeWrappedLines(journalWrapped, marginX + 10, 9.3, 12.5, [30, 41, 59]);
        }
        if (evPhotos.length > 0) {
          y += 4;
          renderPhotoGrid(evPhotos);
        }
        if (evPdfs.length > 0) {
          const pdfLine = `Attached Documents: ${evPdfs
            .map((d) => `${d.filename} (${formatBytesSafe(d.sizeBytes)})`)
            .join('  |  ')}`;
          const pdfWrapped = doc.splitTextToSize(pdfSafeText(pdfLine), contentWidth - 10) as string[];
          writeWrappedLines(pdfWrapped, marginX + 4, 8.5, 11.5, [71, 85, 105]);
        }

        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.5);
        doc.line(marginX, y + 4, pageWidth - marginX, y + 4);
        y += 14;
      }
    }
  }

  // Apply page footers to every page
  const totalPages = doc.getNumberOfPages();
  const generatedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.6);
    doc.line(marginX, pageHeight - 34, pageWidth - marginX, pageHeight - 34);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      pdfSafeText(`Generated by ${opts.generatedByLabel} on ${generatedDate}`),
      marginX,
      pageHeight - 21
    );
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - marginX, pageHeight - 21, {
      align: 'right',
    });
  }

  const outBuffer = doc.output('arraybuffer');
  return new Uint8Array(outBuffer);
}
