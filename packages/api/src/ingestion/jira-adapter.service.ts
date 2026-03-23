import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    description: string | null;
    issuetype: { name: string };
    status: { name: string };
    priority?: { name: string };
    components?: Array<{ name: string }>;
    labels?: string[];
    created: string;
    updated: string;
  };
}

export interface JiraSearchResponse {
  total: number;
  issues: JiraIssue[];
}

export interface ParsedDefect {
  externalId: string;
  title: string;
  description: string;
  severity: 'blocker' | 'critical' | 'major' | 'minor' | 'trivial';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  affectedComponent?: string;
}

/**
 * Jira adapter that fetches issues and converts them to Defect entities
 * for ingestion into the knowledge graph.
 */
@Injectable()
export class JiraAdapterService {
  private readonly logger = new Logger(JiraAdapterService.name);
  private readonly baseUrl?: string;
  private readonly email?: string;
  private readonly apiToken?: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('JIRA_BASE_URL');
    this.email = this.configService.get<string>('JIRA_EMAIL');
    this.apiToken = this.configService.get<string>('JIRA_API_TOKEN');
  }

  get isConfigured(): boolean {
    return !!(this.baseUrl && this.email && this.apiToken);
  }

  /**
   * Fetch defects from Jira using JQL.
   * @param jql JQL query to filter issues (e.g. "project = PROJ AND type = Bug")
   * @param maxResults Max number of issues to fetch
   */
  async fetchDefects(jql: string, maxResults = 50): Promise<ParsedDefect[]> {
    if (!this.isConfigured) {
      throw new Error('Jira is not configured. Set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN.');
    }

    const url = new URL('/rest/api/3/search', this.baseUrl);
    url.searchParams.set('jql', jql);
    url.searchParams.set('maxResults', String(maxResults));
    url.searchParams.set(
      'fields',
      'summary,description,issuetype,status,priority,components,labels,created,updated',
    );

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.email}:${this.apiToken}`).toString('base64')}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Jira API error (${response.status}): ${body}`);
    }

    const data = (await response.json()) as JiraSearchResponse;
    this.logger.log(`Fetched ${data.issues.length} issues from Jira (total: ${data.total})`);

    return data.issues.map((issue) => this.toDefect(issue));
  }

  /**
   * Fetch a single Jira issue by key (e.g. "PROJ-123")
   */
  async fetchIssue(issueKey: string): Promise<ParsedDefect> {
    if (!this.isConfigured) {
      throw new Error('Jira is not configured. Set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN.');
    }

    const url = new URL(`/rest/api/3/issue/${encodeURIComponent(issueKey)}`, this.baseUrl);
    url.searchParams.set(
      'fields',
      'summary,description,issuetype,status,priority,components,labels,created,updated',
    );

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.email}:${this.apiToken}`).toString('base64')}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Jira API error (${response.status}): ${body}`);
    }

    const issue = (await response.json()) as JiraIssue;
    return this.toDefect(issue);
  }

  private toDefect(issue: JiraIssue): ParsedDefect {
    return {
      externalId: issue.key,
      title: issue.fields.summary,
      description: this.extractDescription(issue.fields.description),
      severity: this.mapPriority(issue.fields.priority?.name),
      status: this.mapStatus(issue.fields.status.name),
      affectedComponent: issue.fields.components?.[0]?.name,
    };
  }

  /**
   * Extract plain text from Jira's Atlassian Document Format (ADF) or string description.
   */
  private extractDescription(description: string | null | object): string {
    if (!description) return '';
    if (typeof description === 'string') return description;

    // ADF format — simple recursive text extraction
    return this.extractAdfText(description);
  }

  private extractAdfText(node: unknown): string {
    if (!node || typeof node !== 'object') return '';
    const obj = node as Record<string, unknown>;

    if (obj.type === 'text' && typeof obj.text === 'string') {
      return obj.text;
    }

    if (Array.isArray(obj.content)) {
      return (obj.content as unknown[]).map((c) => this.extractAdfText(c)).join('');
    }

    return '';
  }

  private mapPriority(priority?: string): ParsedDefect['severity'] {
    if (!priority) return 'minor';
    const p = priority.toLowerCase();
    if (p.includes('blocker') || p.includes('highest')) return 'blocker';
    if (p.includes('critical')) return 'critical';
    if (p.includes('major') || p.includes('high')) return 'major';
    if (p.includes('minor') || p.includes('medium') || p.includes('low')) return 'minor';
    if (p.includes('trivial') || p.includes('lowest')) return 'trivial';
    return 'minor';
  }

  private mapStatus(status: string): ParsedDefect['status'] {
    const s = status.toLowerCase();
    if (s.includes('done') || s.includes('closed')) return 'closed';
    if (s.includes('resolved') || s.includes('fixed')) return 'resolved';
    if (s.includes('progress') || s.includes('review')) return 'in_progress';
    return 'open';
  }
}
