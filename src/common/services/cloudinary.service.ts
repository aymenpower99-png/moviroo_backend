import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import crypto from 'crypto';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private readonly cloudName: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(private readonly config: ConfigService) {
    this.cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME') ?? '';
    this.apiKey = this.config.get<string>('CLOUDINARY_API_KEY') ?? '';
    this.apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET') ?? '';
    this.logger.log(
      `Cloudinary config loaded: cloudName=${this.cloudName || '(missing)'} apiKey=${this.apiKey ? 'set' : '(missing)'} apiSecret=${this.apiSecret ? 'set' : '(missing)'}`,
    );
  }

  private ensureConfigured() {
    if (!this.cloudName || !this.apiKey || !this.apiSecret) {
      throw new Error('Cloudinary is not configured');
    }
  }

  signUpload(params: Record<string, string | number | boolean>) {
    this.ensureConfigured();
    // Build signature string: sorted keys, key=value joined with &
    const toSign = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&');
    const signature = crypto
      .createHash('sha1')
      .update(toSign + this.apiSecret)
      .digest('hex');
    return signature;
  }

  async deleteByPublicId(
    publicId: string,
    invalidate = true,
  ): Promise<boolean> {
    this.ensureConfigured();
    try {
      const url = `https://api.cloudinary.com/v1_1/${this.cloudName}/resources/image/upload`;
      const form = new URLSearchParams();
      form.append('public_ids[]', publicId);
      form.append('invalidate', invalidate ? 'true' : 'false');
      const res = await axios.delete(url, {
        data: form,
        auth: { username: this.apiKey, password: this.apiSecret },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      this.logger.log(`Cloudinary delete ${publicId}: ${res.status}`);
      return res.status >= 200 && res.status < 300;
    } catch (err: any) {
      this.logger.warn(
        `Cloudinary delete failed for ${publicId}: ${err.message}`,
      );
      return false;
    }
  }

  async getResource(publicId: string): Promise<{ bytes: number } | null> {
    this.ensureConfigured();
    try {
      const url = `https://api.cloudinary.com/v1_1/${this.cloudName}/resources/image/upload`;
      const res = await axios.get(url, {
        params: { public_ids: [publicId] },
        auth: { username: this.apiKey, password: this.apiSecret },
      });
      const item = Array.isArray(res.data?.resources)
        ? res.data.resources[0]
        : null;
      return item ? { bytes: Number(item.bytes) || 0 } : null;
    } catch (err: any) {
      this.logger.warn(
        `Cloudinary getResource failed for ${publicId}: ${err.message}`,
      );
      return null;
    }
  }

  getCloudName() {
    return this.cloudName;
  }
  getApiKey() {
    return this.apiKey;
  }
}
