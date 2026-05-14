import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

import { TripPayment } from '../entities/trip-payment.entity';
import { Ride } from '../../rides/domain/entities/ride.entity';
import { InvoiceMailService } from '../../mail/services/invoice-mail.service';

const PURPLE = '#7C3AED';
const PURPLE_DARK = '#5B21B6';
const TEXT_PRIMARY = '#111827';
const TEXT_SECONDARY = '#6B7280';
const BG = '#F4F4F8';
const CARD_BG = '#FFFFFF';
const BORDER = '#E5E7EB';
const SUCCESS = '#22C55E';

const LOGO_URL = 'https://res.cloudinary.com/dox9rfabz/image/upload/v1778712358/moviroo_light_dark_big_xormqg.png';

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);
  private _logoBuffer: Buffer | null = null;

  constructor(
    @InjectRepository(TripPayment)
    private readonly paymentRepo: Repository<TripPayment>,
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    private readonly invoiceMail: InvoiceMailService,
  ) {}

  /**
   * Idempotent invoice generation.
   * Generates PDF + saves receiptUrl + emails passenger.
   * Safe to call multiple times — skips if receiptUrl already exists.
   */
  async generateInvoiceIfNeeded(tripPaymentId: string): Promise<void> {
    const payment = await this.paymentRepo.findOne({
      where: { id: tripPaymentId },
      relations: ['ride', 'passenger'],
    });

    if (!payment) {
      this.logger.warn(`TripPayment ${tripPaymentId} not found — skipping invoice`);
      return;
    }

    if (payment.receiptUrl) {
      this.logger.log(`TripPayment ${tripPaymentId} already has receipt — skipping`);
      return;
    }

    if (payment.paymentStatus !== 'PAID') {
      this.logger.warn(`TripPayment ${tripPaymentId} not PAID — skipping invoice`);
      return;
    }

    const ride = payment.ride;
    if (!ride) {
      this.logger.error(`TripPayment ${tripPaymentId} has no ride relation`);
      return;
    }

    try {
      const ref = `TR-${ride.id.substring(0, 8).toUpperCase()}`;
      const filename = `moviroo-receipt-${ref}.pdf`;
      const uploadsDir = path.join(process.cwd(), 'uploads', 'invoices');

      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const filePath = path.join(uploadsDir, filename);
      await this._buildPdf(filePath, ride, payment, ref);

      // Store relative path so it works behind reverse-proxy / ngrok
      payment.receiptUrl = `/uploads/invoices/${filename}`;
      await this.paymentRepo.save(payment);

      this.logger.log(`Invoice PDF generated: ${filePath}`);

      // Send email with attachment
      if (payment.passenger?.email) {
        await this.invoiceMail.sendInvoiceEmail(
          payment.passenger.email,
          ride,
          payment,
          ref,
          filePath,
        );
        this.logger.log(`Invoice email sent to ${payment.passenger.email}`);
      } else {
        this.logger.warn(`Passenger email missing for TripPayment ${tripPaymentId}`);
      }
    } catch (err) {
      this.logger.error(`Failed to generate invoice for ${tripPaymentId}: ${err}`);
      // Don't throw — invoice generation must not break the payment flow
    }
  }

  /**
   * Download logo image once and cache it in memory.
   */
  private async _downloadLogo(): Promise<Buffer | null> {
    if (this._logoBuffer) return this._logoBuffer;
    try {
      const buffer = await new Promise<Buffer>((resolve, reject) => {
        https.get(LOGO_URL, (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        }).on('error', reject);
      });
      this._logoBuffer = buffer;
      return buffer;
    } catch (err) {
      this.logger.warn(`Failed to download logo: ${err}`);
      return null;
    }
  }

  /**
   * Build a Yassir-style Tunisian fiscal receipt PDF.
   */
  private async _buildPdf(
    filePath: string,
    ride: Ride,
    payment: TripPayment,
    ref: string,
  ): Promise<void> {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    /* ── Page geometry ── */
    const PW = doc.page.width;   // 595.28
    const PH = doc.page.height;  // 841.89
    const M = 56.7;              // 20 mm margin
    const W = PW - M * 2;        // content width
    let y = M;

    const PURPLE_Y = '#6B3FE4';
    const BLACK    = '#1A1A1A';
    const GRAY     = '#888888';
    const GRAY_M   = '#555555';
    const GRAY_L   = '#E0E0E0';
    const PURPLE_BG = '#F0ECFD';
    const GREEN_BG  = '#E8F5E9';
    const GREEN_TXT = '#2E7D32';
    const GRAY_BG   = '#F5F5F5';

    const pDate = payment.paidAt
      ? new Date(payment.paidAt)
      : new Date();
    const dateStr = `${pDate.getDate().toString().padStart(2, '0')}/${(pDate.getMonth() + 1).toString().padStart(2, '0')}/${pDate.getFullYear()}`;

    const clientName = payment.passenger
      ? `${payment.passenger.firstName ?? ''} ${payment.passenger.lastName ?? ''}`.trim()
      : 'Client';
    const clientAddr = ride.pickupAddress ?? '-';
    const vehicle    = ride.vehicleClass?.name ?? 'Standard';
    const distance   = `${(ride.distanceKmReal ?? ride.distanceKm ?? 0).toFixed(2)} km`;
    const duration   = `${(ride.durationMinReal ?? ride.durationMin ?? 0)} min`;
    const amount     = payment.amount;
    const amountWords = this._numberToWordsFrench(Math.floor(amount));

    /* ═══════════════════════════════════════════════════
       1. HEADER
    ═══════════════════════════════════════════════════ */
    doc.fontSize(22).font('Helvetica-Bold').fillColor(PURPLE_Y)
      .text('moviroo', M, y);
    doc.fontSize(9).font('Helvetica').fillColor(GRAY)
      .text(`le : ${dateStr}`, M + W - 120, y, { width: 120, align: 'right' });
    y += 26;

    // Separator
    doc.moveTo(M, y).lineTo(M + W, y).strokeColor(GRAY_L).lineWidth(0.5).stroke();
    y += 14;

    /* ═══════════════════════════════════════════════════
       2. TICKET NUMBER BADGE
    ═══════════════════════════════════════════════════ */
    doc.fontSize(11).font('Helvetica-Bold').fillColor(BLACK)
      .text('Ticket de course N\u00b0', M, y);

    const badgeW = 42 * 2.835;
    const badgeH = 7  * 2.835;
    const badgeX = M + W - badgeW;
    doc.roundedRect(badgeX, y - 2, badgeW, badgeH + 4, 3).fill(PURPLE_BG);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(PURPLE_Y)
      .text(ref, badgeX, y + 1, { width: badgeW, align: 'center' });
    y += 26;

    /* ═══════════════════════════════════════════════════
       3. CLIENT BLOCK
    ═══════════════════════════════════════════════════ */
    const clientH = 6 * 2.835;
    doc.roundedRect(M, y, W * 0.65, clientH + 4, 2).fill(PURPLE_BG);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(PURPLE_Y)
      .text('Client', M + 8, y + 4);
    doc.fontSize(8).font('Helvetica').fillColor(GRAY)
      .text('SGA N\u00b0 021 00001 1130047583 23', M + W * 0.65 + 6, y + 4, { width: W * 0.35, align: 'right' });
    y += clientH + 12;

    doc.fontSize(10).font('Helvetica-Bold').fillColor(BLACK)
      .text(clientName, M, y);
    y += 14;
    doc.fontSize(9).font('Helvetica').fillColor(GRAY_M)
      .text(clientAddr, M, y);
    y += 18;

    // Separator
    doc.moveTo(M, y).lineTo(M + W, y).strokeColor(GRAY_L).lineWidth(0.5).stroke();
    y += 14;

    /* ═══════════════════════════════════════════════════
       4. ROUTE (TRAJET)
    ═══════════════════════════════════════════════════ */
    doc.fontSize(9).font('Helvetica-Bold').fillColor(PURPLE_Y)
      .text('TRAJET', M, y);
    y += 18;

    const colX = M + 22;
    const lineY1 = y;
    const lineY2 = y + 50;

    // Pickup circle
    doc.circle(M + 8, lineY1, 3).fill(PURPLE_Y);
    doc.fontSize(8).font('Helvetica').fillColor(GRAY)
      .text('D\u00e9part', colX, lineY1 - 4);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(BLACK)
      .text(ride.pickupAddress ?? '-', colX, lineY1 + 8, { width: W - 40 });

    // Connecting line
    doc.moveTo(M + 8, lineY1 + 4).lineTo(M + 8, lineY2 - 4).strokeColor(PURPLE_Y).dash(3, { space: 2 }).stroke();
    doc.undash();

    // Dropoff square
    const sqSize = 6;
    doc.rect(M + 8 - sqSize / 2, lineY2 - sqSize / 2, sqSize, sqSize).fill(PURPLE_Y);
    doc.fontSize(8).font('Helvetica').fillColor(GRAY)
      .text('Arriv\u00e9e', colX, lineY2 - 4);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(BLACK)
      .text(ride.dropoffAddress ?? '-', colX, lineY2 + 8, { width: W - 40 });
    y = lineY2 + 30;

    // Separator
    doc.moveTo(M, y).lineTo(M + W, y).strokeColor(GRAY_L).lineWidth(0.5).stroke();
    y += 14;

    /* ═══════════════════════════════════════════════════
       5. STATS BAR (3 columns)
    ═══════════════════════════════════════════════════ */
    const colW = W / 3;
    const stats = [
      { label: 'V\u00e9hicule', value: vehicle },
      { label: 'Distance',    value: distance },
      { label: 'Dur\u00e9e',   value: duration },
    ];
    for (let i = 0; i < 3; i++) {
      const cx = M + colW * i;
      if (i > 0) {
        doc.moveTo(cx, y).lineTo(cx, y + 30).strokeColor(GRAY_L).lineWidth(0.5).stroke();
      }
      doc.fontSize(8).font('Helvetica').fillColor(GRAY)
        .text(stats[i].label, cx + 10, y, { width: colW - 20, align: 'center' });
      doc.fontSize(10).font('Helvetica-Bold').fillColor(BLACK)
        .text(stats[i].value, cx + 10, y + 14, { width: colW - 20, align: 'center' });
    }
    y += 40;

    // Separator
    doc.moveTo(M, y).lineTo(M + W, y).strokeColor(GRAY_L).lineWidth(0.5).stroke();
    y += 14;

    /* ═══════════════════════════════════════════════════
       6. DESIGNATION TABLE
    ═══════════════════════════════════════════════════ */
    const tableW = W;
    const labelW = tableW * 0.65;
    const valW   = tableW * 0.35;
    const rowH   = 20;

    // Header
    doc.rect(M, y, tableW, rowH).fill(GRAY_BG);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(GRAY_M)
      .text('DESIGNATION', M + 8, y + 6);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(GRAY_M)
      .text('TOTAL HT', M + labelW, y + 6, { width: valW - 8, align: 'right' });
    y += rowH;

    // Data rows
    const rows = [
      [`Course de transport - MOVIROO ${vehicle.toUpperCase()}`, amount.toFixed(2)],
      ['TVA 0%', '-'],
      ['Pourboire', '0.00'],
    ];
    for (const [lbl, val] of rows) {
      doc.moveTo(M, y).lineTo(M + tableW, y).strokeColor(GRAY_L).lineWidth(0.3).stroke();
      doc.fontSize(9).font('Helvetica').fillColor(BLACK)
        .text(lbl, M + 8, y + 6);
      doc.fontSize(9).font('Helvetica').fillColor(BLACK)
        .text(val, M + labelW, y + 6, { width: valW - 8, align: 'right' });
      y += rowH;
    }
    doc.moveTo(M, y).lineTo(M + tableW, y).strokeColor(GRAY_L).lineWidth(0.3).stroke();
    y += 10;

    // Sub-summary (right-aligned, 55 mm from left)
    const sumX = M + 55 * 2.835;
    const sumW = W - (55 * 2.835);
    const sumRows = [
      ['Montant HT Total', amount.toFixed(2)],
      ['TVA 9% Exon\u00e9r\u00e9 LFC2021', ''],
      ['Droit de Timbre 1%', '0.00'],
      ['Pourboire', '0.00'],
    ];
    for (const [lbl, val] of sumRows) {
      doc.fontSize(9).font('Helvetica').fillColor(GRAY_M)
        .text(lbl, sumX, y, { width: sumW * 0.6 });
      if (val) {
        doc.fontSize(9).font('Helvetica-Bold').fillColor(BLACK)
          .text(val, sumX + sumW * 0.6, y, { width: sumW * 0.4, align: 'right' });
      }
      y += 16;
    }

    // Total TTC highlight row
    const ttcY = y;
    doc.roundedRect(sumX, ttcY - 2, sumW, 20, 3).fill(PURPLE_BG);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(PURPLE_Y)
      .text('Total TTC', sumX + 8, ttcY + 4, { width: sumW * 0.5 });
    doc.fontSize(10).font('Helvetica-Bold').fillColor(PURPLE_Y)
      .text(`${amount.toFixed(2)}`, sumX + sumW * 0.5, ttcY + 4, { width: sumW * 0.5 - 8, align: 'right' });
    y = ttcY + 28;

    // Separator
    doc.moveTo(M, y).lineTo(M + W, y).strokeColor(GRAY_L).lineWidth(0.5).stroke();
    y += 14;

    /* ═══════════════════════════════════════════════════
       7. AMOUNT IN WORDS
    ═══════════════════════════════════════════════════ */
    const wordsH = 42;
    doc.roundedRect(M, y, W, wordsH, 3).strokeColor(GRAY_L).lineWidth(0.5).stroke();
    doc.fontSize(8).font('Helvetica').fillColor(GRAY)
      .text('Arr\u00eat\u00e9 le pr\u00e9sent Ticket de course \u00e0 la somme de :', M + 10, y + 8);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(BLACK)
      .text(`${amountWords} dinars tunisiens`, M + 10, y + 24);
    y += wordsH + 14;

    /* ═══════════════════════════════════════════════════
       8. PAYMENT STATUS
    ═══════════════════════════════════════════════════ */
    const methodLabel = payment.paymentMethod === 'CARD'
      ? 'Carte bancaire'
      : 'Esp\u00e8ces';
    const payBadgeW = 70;
    const payBadgeH = 20;
    doc.roundedRect(M, y - 2, payBadgeW, payBadgeH + 4, 3).fill(GREEN_BG);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(GREEN_TXT)
      .text('Pay\u00e9 \u2713', M, y + 3, { width: payBadgeW, align: 'center' });
    doc.fontSize(9).font('Helvetica').fillColor(GRAY_M)
      .text(`Mode de paiement : ${methodLabel}`, M + payBadgeW + 10, y + 3);
    y += 30;

    // Separator
    doc.moveTo(M, y).lineTo(M + W, y).strokeColor(GRAY_L).lineWidth(0.5).stroke();
    y += 12;

    /* ═══════════════════════════════════════════════════
       9. FOOTER
    ═══════════════════════════════════════════════════ */
    const fH = 14;
    const col1W = W / 3;

    // Column 1
    doc.fontSize(7).font('Helvetica').fillColor(GRAY)
      .text('MOVIEROO SARL', M, y);
    doc.fontSize(7).font('Helvetica').fillColor(GRAY)
      .text('Immeuble Le ZENITH, Les Berges du Lac 2', M, y + fH);
    doc.fontSize(7).font('Helvetica').fillColor(GRAY)
      .text('Capital social : 50 000 TND', M, y + fH * 2);

    // Column 2
    doc.fontSize(7).font('Helvetica').fillColor(GRAY)
      .text('RIB : 07 401 0014010003711 23', M + col1W, y);
    doc.fontSize(7).font('Helvetica').fillColor(GRAY)
      .text('AMEN BANK - Agence Les Berges du Lac', M + col1W, y + fH);

    // Column 3
    doc.fontSize(7).font('Helvetica').fillColor(GRAY)
      .text('RC : B11222332022', M + col1W * 2, y);
    doc.fontSize(7).font('Helvetica').fillColor(GRAY)
      .text('NIF : 1836651D / NIS : 0001836651D000', M + col1W * 2, y + fH);

    y += fH * 3 + 10;

    // Bottom separator
    doc.moveTo(M, y).lineTo(M + W, y).strokeColor(GRAY_L).lineWidth(0.5).stroke();
    y += 8;

    // Page number
    doc.fontSize(8).font('Helvetica').fillColor(GRAY)
      .text('1/1', M + W - 30, y, { width: 30, align: 'right' });

    doc.end();
    return new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }

  /**
   * Convert a number (0-999999) to French words.
   */
  private _numberToWordsFrench(n: number): string {
    if (n === 0) return 'z\u00e9ro';

    const UNITS = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
      'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
      'dix-sept', 'dix-huit', 'dix-neuf'];
    const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante',
      'quatre-vingt', 'quatre-vingt'];

    function _convertBelow1000(num: number): string {
      if (num === 0) return '';
      if (num < 20) return UNITS[num];
      if (num < 100) {
        const t = Math.floor(num / 10);
        const u = num % 10;
        if (t === 7 || t === 9) {
          return TENS[t] + (u > 0 ? '-' + UNITS[u + 10] : '');
        }
        return TENS[t] + (u > 0 ? (t === 8 && u === 0 ? '' : '-' + UNITS[u]) : '');
      }
      const h = Math.floor(num / 100);
      const r = num % 100;
      let s = '';
      if (h === 1) s = 'cent';
      else s = UNITS[h] + ' cent';
      if (r > 0) s += ' ' + _convertBelow1000(r);
      return s;
    }

    const parts: string[] = [];
    if (n >= 1000) {
      const thousands = Math.floor(n / 1000);
      if (thousands === 1) parts.push('mille');
      else parts.push(_convertBelow1000(thousands) + ' mille');
      n %= 1000;
    }
    if (n > 0) {
      parts.push(_convertBelow1000(n));
    }
    return parts.join(' ');
  }
}
