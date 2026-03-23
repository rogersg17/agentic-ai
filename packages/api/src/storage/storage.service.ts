import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import { randomUUID } from 'node:crypto';
import { BUCKETS } from '@agentic/shared';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: MinioClient;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    this.client = new MinioClient({
      endPoint: this.configService.get<string>('minio.endpoint', 'localhost'),
      port: this.configService.get<number>('minio.port', 9000),
      useSSL: false,
      accessKey: this.configService.get<string>('minio.accessKey', 'agentic'),
      secretKey: this.configService.get<string>('minio.secretKey', 'agentic_dev'),
    });
    this.bucket = this.configService.get<string>('minio.bucket', BUCKETS.ARTIFACTS);
  }

  async onModuleInit(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket);
        this.logger.log(`Created bucket: ${this.bucket}`);
      }
      this.logger.log('MinIO storage connected');
    } catch (error) {
      this.logger.warn('MinIO not available — file uploads will fail', error);
    }
  }

  /**
   * Upload a buffer to object storage under a given prefix.
   * Returns the object key (path) for retrieval.
   */
  async upload(
    prefix: string,
    filename: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    const key = `${prefix}/${randomUUID()}-${filename}`;
    await this.client.putObject(this.bucket, key, buffer, buffer.length, {
      'Content-Type': contentType,
    });
    this.logger.debug(`Uploaded ${key} (${buffer.length} bytes)`);
    return key;
  }

  /**
   * Download an object as a Buffer.
   */
  async download(key: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  /**
   * Generate a pre-signed URL for temporary read access.
   */
  async getPresignedUrl(key: string, expirySeconds = 3600): Promise<string> {
    return this.client.presignedGetObject(this.bucket, key, expirySeconds);
  }

  /**
   * Delete an object from storage.
   */
  async delete(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }
}
