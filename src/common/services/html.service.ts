import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type { Response } from 'express';

@Injectable()
export class HtmlService {
  private render(
    templatePath: string,
    replacements: Record<string, string>,
  ): string {
    let html = fs.readFileSync(templatePath, 'utf-8');
    for (const [key, value] of Object.entries(replacements)) {
      html = html.replaceAll(key, value);
    }
    return html;
  }

  // ─── Admin: Activation Form ───────────────────────────────────────────────

  sendActivationForm(token: string, res: Response): void {
    const templatePath = path.join(
      process.cwd(),
      'dist',
      'templates',
      'activate.html',
    );
    const html = this.render(templatePath, { __TOKEN__: token ?? '' });
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
  }

  // ─── Auth: Reset Password Form ────────────────────────────────────────────

  sendResetPasswordForm(res: Response): void {
    const templatePath = path.join(
      process.cwd(),
      'dist',
      'templates',
      'reset-password.html',
    );
    const html = fs.readFileSync(templatePath, 'utf-8');
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
  }

  // ─── Auth: Reset Password Success ─────────────────────────────────────────

  sendResetPasswordSuccess(res: Response): void {
    const templatePath = path.join(
      process.cwd(),
      'dist',
      'templates',
      'reset-password-success.html',
    );
    const html = this.render(templatePath, {
      __YEAR__: new Date().getFullYear().toString(),
    });
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
  }

  // ─── Auth: Verify Email Success ──────────────────────────────────────────

  sendVerifyEmailSuccess(
    accessToken: string,
    refreshToken: string,
    res: Response,
  ): void {
    const templatePath = path.join(
      process.cwd(),
      'dist',
      'templates',
      'verify-email-success.html',
    );
    const html = this.render(templatePath, {
      __YEAR__: new Date().getFullYear().toString(),
      '{{ACCESS_TOKEN}}': accessToken,
      '{{REFRESH_TOKEN}}': refreshToken,
    });
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
  }

  sendVerifyEmailSuccessSimple(res: Response): void {
    const templatePath = path.join(
      process.cwd(),
      'dist',
      'templates',
      'verify-email-success-simple.html',
    );
    const html = this.render(templatePath, {
      __YEAR__: new Date().getFullYear().toString(),
    });
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
  }

  // ─── Auth: Verify Email Error ──────────────────────────────────────────

  sendVerifyEmailError(message: string, res: Response): void {
    const templatePath = path.join(
      process.cwd(),
      'dist',
      'templates',
      'verify-email-error.html',
    );
    const html = this.render(templatePath, {
      '{{ERROR_MESSAGE}}': message,
      '{{YEAR}}': new Date().getFullYear().toString(),
    });
    res.setHeader('Content-Type', 'text/html');
    res.status(400).send(html);
  }

  // ─── Auth: Email Change Success ───────────────────────────────────────────

  sendEmailChangeSuccess(newEmail: string, res: Response): void {
    const templatePath = path.join(
      process.cwd(),
      'dist',
      'templates',
      'email-change-success.html',
    );
    const html = this.render(templatePath, {
      '{{NEW_EMAIL}}': newEmail,
      '{{YEAR}}': new Date().getFullYear().toString(),
    });
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
  }

  // ─── Auth: Email Change Error ─────────────────────────────────────────────

  sendEmailChangeError(message: string, res: Response): void {
    const templatePath = path.join(
      process.cwd(),
      'dist',
      'templates',
      'email-change-error.html',
    );
    const html = this.render(templatePath, {
      '{{ERROR_MESSAGE}}': message,
      '{{YEAR}}': new Date().getFullYear().toString(),
    });
    res.setHeader('Content-Type', 'text/html');
    res.status(400).send(html);
  }
}
