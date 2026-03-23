import { Injectable, Logger } from '@nestjs/common';
import { StorageService } from '../storage/storage.service.js';
import { ARTIFACT_PATHS } from '@agentic/shared';

export interface CollectedArtifacts {
  screenshotUrl?: string;
  traceUrl?: string;
  domSnapshotUrl?: string;
  logUrl?: string;
}

@Injectable()
export class ArtifactCollectionService {
  private readonly logger = new Logger(ArtifactCollectionService.name);

  constructor(private readonly storage: StorageService) {}

  /**
   * Upload a Playwright trace file (ZIP) to object storage.
   */
  async uploadTrace(runId: string, testId: string, buffer: Buffer): Promise<string> {
    const key = await this.storage.upload(
      `${ARTIFACT_PATHS.TRACES}/${runId}`,
      `${testId}.zip`,
      buffer,
      'application/zip',
    );
    this.logger.debug(`Uploaded trace for test ${testId}: ${key}`);
    return key;
  }

  /**
   * Upload a screenshot (PNG) to object storage.
   */
  async uploadScreenshot(runId: string, testId: string, buffer: Buffer): Promise<string> {
    const key = await this.storage.upload(
      `${ARTIFACT_PATHS.SCREENSHOTS}/${runId}`,
      `${testId}.png`,
      buffer,
      'image/png',
    );
    this.logger.debug(`Uploaded screenshot for test ${testId}: ${key}`);
    return key;
  }

  /**
   * Upload a DOM snapshot (HTML) to object storage.
   */
  async uploadDomSnapshot(runId: string, testId: string, content: string): Promise<string> {
    const key = await this.storage.upload(
      `${ARTIFACT_PATHS.DOM_SNAPSHOTS}/${runId}`,
      `${testId}.html`,
      Buffer.from(content, 'utf-8'),
      'text/html',
    );
    this.logger.debug(`Uploaded DOM snapshot for test ${testId}: ${key}`);
    return key;
  }

  /**
   * Upload test log output to object storage.
   */
  async uploadLog(runId: string, testId: string, content: string): Promise<string> {
    const key = await this.storage.upload(
      `${ARTIFACT_PATHS.LOGS}/${runId}`,
      `${testId}.log`,
      Buffer.from(content, 'utf-8'),
      'text/plain',
    );
    this.logger.debug(`Uploaded log for test ${testId}: ${key}`);
    return key;
  }

  /**
   * Given a set of raw artifact buffers from a test run, upload them all
   * and return the storage keys.
   */
  async collectAll(
    runId: string,
    testId: string,
    artifacts: {
      trace?: Buffer;
      screenshot?: Buffer;
      domSnapshot?: string;
      log?: string;
    },
  ): Promise<CollectedArtifacts> {
    const result: CollectedArtifacts = {};

    const uploads = [];

    if (artifacts.trace) {
      uploads.push(
        this.uploadTrace(runId, testId, artifacts.trace).then((k) => {
          result.traceUrl = k;
        }),
      );
    }
    if (artifacts.screenshot) {
      uploads.push(
        this.uploadScreenshot(runId, testId, artifacts.screenshot).then((k) => {
          result.screenshotUrl = k;
        }),
      );
    }
    if (artifacts.domSnapshot) {
      uploads.push(
        this.uploadDomSnapshot(runId, testId, artifacts.domSnapshot).then((k) => {
          result.domSnapshotUrl = k;
        }),
      );
    }
    if (artifacts.log) {
      uploads.push(
        this.uploadLog(runId, testId, artifacts.log).then((k) => {
          result.logUrl = k;
        }),
      );
    }

    await Promise.all(uploads);

    return result;
  }

  /** Get a pre-signed URL for an artifact key */
  async getArtifactUrl(key: string): Promise<string> {
    return this.storage.getPresignedUrl(key, 3600);
  }
}
