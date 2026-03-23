import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Generates text embeddings via the LLM gateway (LiteLLM proxy).
 * Falls back to a simple hash-based embedding for dev/testing when no
 * LLM gateway is available.
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly gatewayUrl: string;
  private readonly dimensions = 1536;

  constructor(private readonly configService: ConfigService) {
    this.gatewayUrl = this.configService.get<string>('llm.gatewayUrl', 'http://localhost:4000');
  }

  /**
   * Generate an embedding vector for the given text.
   * Uses the LLM gateway's /embeddings endpoint (OpenAI-compatible).
   */
  async embed(text: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.gatewayUrl}/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: text.slice(0, 8000), // Truncate to model limit
        }),
      });

      if (!response.ok) {
        throw new Error(`Embedding API error: ${response.status}`);
      }

      const data = (await response.json()) as {
        data: Array<{ embedding: number[] }>;
      };
      return data.data[0].embedding;
    } catch (error) {
      this.logger.debug('LLM gateway unavailable, using deterministic fallback embedding');
      return this.fallbackEmbed(text);
    }
  }

  /**
   * Batch embed multiple texts.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    // Process sequentially to respect rate limits
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }

  /**
   * Deterministic fallback embedding based on text hashing.
   * Produces a stable 1536-dimensional vector for dev/testing.
   * Not suitable for production semantic search.
   */
  private fallbackEmbed(text: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);
    const normalized = text.toLowerCase().trim();

    for (let i = 0; i < normalized.length; i++) {
      const charCode = normalized.charCodeAt(i);
      const idx = (i * 31 + charCode) % this.dimensions;
      vector[idx] += charCode / 128;
    }

    // Normalize to unit vector
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude > 0) {
      for (let i = 0; i < this.dimensions; i++) {
        vector[i] /= magnitude;
      }
    }

    return vector;
  }
}
