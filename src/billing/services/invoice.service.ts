import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import PDFDocument = require('pdfkit');
import * as fs from 'fs';
import * as path from 'path';

import { TripPayment } from '../entities/trip-payment.entity';
import { Ride } from '../../rides/domain/entities/ride.entity';
import { InvoiceMailService } from '../../mail/services/invoice-mail.service';

const LOGO_URL =
  'https://res.cloudinary.com/dox9rfabz/image/upload/v1778712358/moviroo_light_dark_big_xormqg.png';

const C_PURPLE   = '#6B3FE4';
const C_PURPLE_L = '#F0ECFD';
const C_PURPLE_M = '#E4DCFA';
const C_TEAL     = '#0891B2';
const C_TEAL_L   = '#E0F7FA';
const C_AMBER    = '#D97706';
const C_AMBER_L  = '#FEF3C7';
const C_GREEN_L  = '#E8F5E9';
const C_GREEN    = '#2E7D32';
const C_RED      = '#E63946';
const C_DARK     = '#1A1A1A';
const C_MID      = '#555555';
const C_MUTED    = '#888888';
const C_BORDER   = '#E0E0E0';
const C_WHITE    = '#FFFFFF';

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    @InjectRepository(TripPayment)
    private readonly paymentRepo: Repository<TripPayment>,
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    private readonly invoiceMail: InvoiceMailService,
  ) {}

  async generateInvoiceIfNeeded(tripPaymentId: string): Promise<void> {
    this.logger.log(`Invoice generation requested for TripPayment: ${tripPaymentId}`);

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
    if (payment.paymentStatus !== 'PAID' && payment.paymentStatus !== 'REFUNDED') {
      this.logger.warn(`TripPayment ${tripPaymentId} not PAID/REFUNDED — skipping invoice`);
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

      payment.receiptUrl = `/uploads/invoices/${filename}`;
      await this.paymentRepo.save(payment);
      this.logger.log(`Invoice saved: ${filePath}`);

      if (payment.passenger?.email) {
        await this.invoiceMail.sendInvoiceEmail(
          payment.passenger.email, ride, payment, ref, filePath,
        );
        this.logger.log(`Invoice emailed to ${payment.passenger.email}`);
      }
    } catch (err) {
      this.logger.error(`Failed to generate invoice for ${tripPaymentId}: ${err}`);
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  PDF builder
  // ─────────────────────────────────────────────────────────────
  private async _buildPdf(
    filePath: string,
    ride: Ride,
    payment: TripPayment,
    ref: string,
  ): Promise<void> {
    const doc = new PDFDocument({ size: 'A4', margin: 0, compress: true });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const PW = doc.page.width;
    const M  = 40;
    const W  = PW - M * 2;
    let   y  = 0;

    // ── helpers ──────────────────────────────────────────────
    const sep = (gap = 14) => {
      doc.moveTo(M, y).lineTo(M + W, y).strokeColor(C_BORDER).lineWidth(0.5).stroke();
      y += gap;
    };

    const sectionLabel = (text: string) => {
      doc.fontSize(8).font('Helvetica-Bold').fillColor(C_PURPLE).text(text, M, y);
      y += 14;
    };

    // ── compute amounts ──────────────────────────────────────
    const pDate      = payment.paidAt ? new Date(payment.paidAt) : new Date();
    const dateStr    = pDate.toLocaleDateString('fr-FR');
    const clientName = payment.passenger
      ? `${payment.passenger.firstName ?? ''} ${payment.passenger.lastName ?? ''}`.trim()
      : 'Client';
    const vehicle    = ride.vehicleClass?.name ?? 'Standard';
    const distStr    = `${(ride.distanceKmReal ?? ride.distanceKm ?? 0).toFixed(2)} km`;
    const durStr     = `${ride.durationMinReal ?? ride.durationMin ?? 0} min`;
    const amountNum  = payment.amount;
    const discountPercent = ride.discountPercent ?? 0;
    // Use priceEstimate as the original undiscounted price, or fall back to payment amount
    const originalPrice = ride.priceEstimate ?? amountNum;
    const discountNum = discountPercent > 0
      ? parseFloat((originalPrice * (discountPercent / 100)).toFixed(2))
      : 0;
    const totalNum   = amountNum;
    const amountStr  = originalPrice.toFixed(2);
    const totalStr   = totalNum.toFixed(2);
    const payMethod  = payment.paymentMethod === 'CARD' ? 'Carte bancaire' : 'Espèces';
    const amtWords   = this._numberToWordsFrench(Math.floor(totalNum));

    // ════════════════════════════════════════════════════════
    //  HEADER
    // ════════════════════════════════════════════════════════
    const HEADER_H = 70;
    doc.rect(0, 0, PW, HEADER_H).fill(C_WHITE);
    doc.rect(0, HEADER_H - 2, PW, 2).fill(C_PURPLE);
    y = 0;

    const logoBuffer = await this._downloadLogo();
    if (logoBuffer) {
      doc.image(logoBuffer, M, 12, { height: 80 });
    } else {
      doc.fontSize(24).font('Helvetica-Bold').fillColor(C_PURPLE).text('moviroo', M, 18);
    }

    y = HEADER_H + 20;

    // ════════════════════════════════════════════════════════
    //  CLIENT BLOCK
    // ════════════════════════════════════════════════════════
    doc.fontSize(8).font('Helvetica-Bold').fillColor(C_PURPLE).text('CLIENT', M, y);
    y += 14;

    const cardH = 36;
    doc.roundedRect(M, y, W, cardH, 6).fill(C_PURPLE_L);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(C_DARK).text(clientName, M + 12, y + 8);
    doc.fontSize(9).font('Helvetica').fillColor(C_MID)
       .text(ride.pickupAddress ?? '-', M + 12, y + 22);
    const pillW = 100, pillH = 18;
    doc.roundedRect(M + W - pillW - 10, y + (cardH - pillH) / 2, pillW, pillH, 9).fill(C_PURPLE);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(C_WHITE)
       .text(ref, M + W - pillW - 10, y + (cardH - pillH) / 2 + 5,
         { width: pillW, align: 'center' });
    y += cardH + 18;

    sep(16);

    // ════════════════════════════════════════════════════════
    //  TRAJET
    // ════════════════════════════════════════════════════════
    doc.fontSize(8).font('Helvetica-Bold').fillColor(C_PURPLE).text('TRAJET', M, y);
    doc.fontSize(8).font('Helvetica').fillColor(C_MUTED)
       .text(`le : ${dateStr}`, M, y, { width: W, align: 'right' });
    y += 16;

    const ROUTE_CARD_H = 40;
    const ICON_CX      = M + 16;

    doc.roundedRect(M, y, W, ROUTE_CARD_H, 6)
       .strokeColor(C_PURPLE).lineWidth(1).stroke();
    doc.circle(ICON_CX, y + ROUTE_CARD_H / 2, 5).fill(C_PURPLE);
    doc.fontSize(8).font('Helvetica').fillColor(C_MUTED).text('Depart', M + 32, y + 8);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(C_DARK)
       .text(ride.pickupAddress ?? '-', M + 32, y + 20, { width: W - 42, lineBreak: false });
    y += ROUTE_CARD_H;

    const GAP_H = 18;
    doc.moveTo(ICON_CX, y + 2).lineTo(ICON_CX, y + GAP_H - 2)
       .strokeColor('#C8BAEF').lineWidth(2).dash(3, { space: 3 }).stroke();
    doc.undash();
    y += GAP_H;

    doc.roundedRect(M, y, W, ROUTE_CARD_H, 6)
       .strokeColor(C_PURPLE).lineWidth(1).stroke();
    doc.rect(ICON_CX - 5, y + ROUTE_CARD_H / 2 - 5, 10, 10).fill(C_PURPLE);
    doc.fontSize(8).font('Helvetica').fillColor(C_MUTED).text('Arrivee', M + 32, y + 8);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(C_DARK)
       .text(ride.dropoffAddress ?? '-', M + 32, y + 20, { width: W - 42, lineBreak: false });
    y += ROUTE_CARD_H + 6;

    sep(16);

    // ════════════════════════════════════════════════════════
    //  STATS BAR — 3 cards with PDFKit-safe drawn icons
    // ════════════════════════════════════════════════════════
    const CARD_H   = 56;
    const CARD_GAP = 10;
    const CARD_W   = (W - CARD_GAP * 2) / 3;

    const statCards = [
      { label: 'VEHICULE', value: vehicle },
      { label: 'DISTANCE', value: distStr },
      { label: 'DUREE',    value: durStr  },
    ];

    statCards.forEach((card, i) => {
      const cx = M + i * (CARD_W + CARD_GAP);

      // card background
      doc.roundedRect(cx, y, CARD_W, CARD_H, 8).fill(C_PURPLE_L);

      // top accent bar
      doc.roundedRect(cx, y, CARD_W, 4, 2).fill(C_PURPLE);
      doc.rect(cx, y + 2, CARD_W, 2).fill(C_PURPLE);

      // label
      doc.fontSize(7).font('Helvetica-Bold').fillColor(C_PURPLE)
         .text(card.label, cx + 10, y + 12, { width: CARD_W - 20, align: 'center' });

      // value
      doc.fontSize(13).font('Helvetica-Bold').fillColor(C_DARK)
         .text(card.value, cx + 10, y + 30, { width: CARD_W - 20, align: 'center' });
    });

    y += CARD_H + 18;
    sep(16);

    // ════════════════════════════════════════════════════════
    //  DETAIL DE LA COURSE
    // ════════════════════════════════════════════════════════
    sectionLabel('DETAIL DE LA COURSE');

    const COL1_X = M;
    const COL2_X = M + W - 110;
    const COL_W2 = 110;
    const ROW_H  = 30;
    const TABLE_ROWS = 4;
    const TABLE_H = ROW_H * TABLE_ROWS + ROW_H;

    doc.roundedRect(M, y, W, TABLE_H, 6).strokeColor(C_BORDER).lineWidth(0.5).stroke();
    doc.roundedRect(M, y, W, ROW_H, 6).fill(C_PURPLE_L);
    doc.rect(M, y + ROW_H / 2, W, ROW_H / 2).fill(C_PURPLE_L);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(C_PURPLE)
       .text('Designation', COL1_X + 10, y + 11);
    doc.text('Total HT', COL2_X, y + 11, { width: COL_W2 - 10, align: 'right' });
    doc.moveTo(M, y + ROW_H).lineTo(M + W, y + ROW_H).strokeColor(C_BORDER).lineWidth(0.5).stroke();
    y += ROW_H;

    const tableRow = (label: string, value: string, bold = false, color = C_DARK) => {
      if (bold) {
        doc.fontSize(9).font('Helvetica-Bold').fillColor(color).text(label, COL1_X + 10, y + 11);
        doc.text(value, COL2_X, y + 11, { width: COL_W2 - 10, align: 'right' });
      } else {
        doc.fontSize(9).font('Helvetica').fillColor(color).text(label, COL1_X + 10, y + 11);
        doc.fontSize(9).font('Helvetica').fillColor(color)
           .text(value, COL2_X, y + 11, { width: COL_W2 - 10, align: 'right' });
      }
      y += ROW_H;
      doc.moveTo(M, y).lineTo(M + W, y).strokeColor(C_BORDER).lineWidth(0.5).stroke();
    };

    tableRow(`Course de transport — MOVIROO ${vehicle.toUpperCase()}`, `${amountStr} TND`);
    tableRow('TVA 0%', '—');
    if (discountNum > 0) {
      tableRow('Remise (Discount)', `-${discountNum.toFixed(2)} TND`, true, C_RED);
    } else {
      tableRow('Remise (Discount)', '—');
    }
    tableRow('Pourboire', '0.00 TND');
    y += 14;

    // ════════════════════════════════════════════════════════
    //  SUMMARY
    // ════════════════════════════════════════════════════════
    const SUM_W = W, SUM_X = M;
    const SROW_H = 26;

    doc.roundedRect(SUM_X, y, SUM_W, SROW_H * 3 + 36, 6).strokeColor(C_BORDER).lineWidth(0.5).stroke();

    const sumRow = (label: string, value: string) => {
      doc.fontSize(9).font('Helvetica').fillColor(C_MID).text(label, SUM_X + 12, y + 9);
      if (value) {
        doc.fontSize(9).font('Helvetica-Bold').fillColor(C_DARK)
           .text(value, SUM_X, y + 9, { width: SUM_W - 12, align: 'right' });
      }
      doc.moveTo(SUM_X, y + SROW_H).lineTo(SUM_X + SUM_W, y + SROW_H)
         .strokeColor(C_BORDER).lineWidth(0.5).stroke();
      y += SROW_H;
    };

    sumRow('Montant HT Total',   `${totalStr} TND`);
    sumRow('Droit de Timbre 1%', '0.00');
    sumRow('Pourboire',          '0.00');

    doc.roundedRect(SUM_X, y, SUM_W, 36, 6).fill(C_PURPLE);
    doc.rect(SUM_X, y, SUM_W, 10).fill(C_PURPLE);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(C_WHITE).text('Total TTC', SUM_X + 14, y + 13);
    doc.text(`${totalStr} TND`, SUM_X, y + 13, { width: SUM_W - 14, align: 'right' });
    y += 48;

    sep(16);

    // ════════════════════════════════════════════════════════
    //  AMOUNT IN WORDS
    // ════════════════════════════════════════════════════════
    doc.roundedRect(M, y, W, 38, 6).strokeColor(C_BORDER).lineWidth(0.5).stroke();
    doc.fontSize(8).font('Helvetica').fillColor(C_MUTED)
       .text('Arrete le present Ticket de course a la somme de :', M + 12, y + 7);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(C_DARK)
       .text(`${amtWords} dinars tunisiens`, M + 12, y + 19, { width: W - 24 });
    y += 50;

    // ════════════════════════════════════════════════════════
    //  PAYMENT STATUS
    // ════════════════════════════════════════════════════════
    doc.roundedRect(M, y, 62, 20, 10).fill(C_GREEN_L);
    // draw checkmark instead of emoji ✓
    doc.moveTo(M + 10, y + 10).lineTo(M + 14, y + 14).lineTo(M + 22, y + 6)
       .strokeColor(C_GREEN).lineWidth(2).stroke();
    doc.fontSize(10).font('Helvetica-Bold').fillColor(C_GREEN).text('Paye', M + 26, y + 6);
    doc.fontSize(9).font('Helvetica').fillColor(C_MID)
       .text(`Mode de paiement : ${payMethod}`, M + 72, y + 6);
    y += 30;

    doc.fontSize(8).font('Helvetica').fillColor(C_MUTED)
       .text('1 / 1', M, y, { width: W, align: 'right' });

    doc.end();
    return new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }

  // ─────────────────────────────────────────────────────────────
  private async _downloadLogo(): Promise<Buffer | null> {
    try {
      const https = await import('https');
      return new Promise((resolve, reject) => {
        https.get(LOGO_URL, (res: any) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end',  () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        }).on('error', reject);
      });
    } catch {
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────
  private _numberToWordsFrench(n: number): string {
    if (n === 0) return 'zero';
    const UNITS = ['','un','deux','trois','quatre','cinq','six','sept','huit','neuf',
      'dix','onze','douze','treize','quatorze','quinze','seize','dix-sept','dix-huit','dix-neuf'];
    const TENS  = ['','','vingt','trente','quarante','cinquante','soixante','soixante','quatre-vingt','quatre-vingt'];
    function below1000(n: number): string {
      if (n === 0)  return '';
      if (n < 20)   return UNITS[n];
      if (n < 100) {
        const t = Math.floor(n / 10), u = n % 10;
        if (t === 7 || t === 9) return TENS[t] + (u > 0 ? '-' + UNITS[u + 10] : '');
        return TENS[t] + (u > 0 ? (t === 8 && u === 0 ? '' : '-' + UNITS[u]) : '');
      }
      const h = Math.floor(n / 100), r = n % 100;
      const s = h === 1 ? 'cent' : UNITS[h] + ' cent';
      return r > 0 ? s + ' ' + below1000(r) : s;
    }
    const parts: string[] = [];
    if (n >= 1000) {
      const th = Math.floor(n / 1000);
      parts.push(th === 1 ? 'mille' : below1000(th) + ' mille');
      n %= 1000;
    }
    if (n > 0) parts.push(below1000(n));
    return parts.join(' ');
  }
}