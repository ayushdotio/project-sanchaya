import axios, { AxiosResponse } from "axios";
import { Readable } from "stream";
import { env } from "../config/env.js";
import {
  FindingCategory,
  VerificationStatus,
} from "../types/source.types.js";

export interface SerializedSourceRecord {
  source_id: string;
  source_type: "github" | "document" | "task";
  origin: string;
  raw_filename?: string;
  redacted_content: string;
  metadata?: Record<string, any>;
  created_at: Date | string;
  updated_at: Date | string;
  imported_at?: Date | string;
}

export interface TriggerExtractionOptions {
  sourceRecords?: SerializedSourceRecord[];
  databaseName?: string;
}

export interface ExtractionResponse {
  success: boolean;
  message?: string;
  findingsCount?: number;
  supportedCount?: number;
  gapsGenerated?: number;
  sourcesUsed?: number;
  sourceIds?: string[];
  error?: string;
}

export interface EvidenceValidationPayload {
  source_text?: string;
  evidence_excerpt?: string;
  claim?: string;
  source_id?: string;
  projectId?: string;
  topic?: string;
  category?: FindingCategory;
  owner?: string;
  deadline?: string;
}

export interface EvidenceValidationResponse {
  status: VerificationStatus;
  explanation: string;
  source_id?: string | null;
  conflicting_source_id?: string | null;
  conflict_details?: Record<string, any> | null;
  freshness?: Record<string, any> | null;
}

export interface FreshnessScanResponse {
  scanned: number;
  current_count: number;
  stale_count: number;
  invalid_date_count: number;
  stale_evidence_ids: string[];
  invalid_date_evidence_ids: string[];
  max_age_days: number;
  checked_at: string;
}

export interface GapQuestionGenerationResponse {
  question: string | null;
}

export interface AIEngineHealthResponse {
  status: string;
  service?: string;
  database?: string;
}

export interface AnalyticsHealthResponse {
  status: string;
  service?: string;
  store?: string;
}

export interface RiskAndReadinessResponse {
  success: boolean;
  message?: string;
  readinessStatus?: string;
  checklist?: Record<string, boolean>;
  riskSummary?: Record<string, any>;
  error?: string;
}

type BridgeError = Error & { statusCode?: number };

const DOCKER_SERVICE_HOSTS = new Set(["ai-engine", "analytics-service"]);

export class PythonBridge {
  private aiBaseUrl: string;
  private analyticsBaseUrl: string;

  constructor() {
    this.aiBaseUrl = env.AI_SERVICE_URL;
    this.analyticsBaseUrl = env.ANALYTICS_SERVICE_URL;
  }

  private getInternalHeaders(): Record<string, string> {
    return env.INTERNAL_API_TOKEN
      ? { "X-Internal-Token": env.INTERNAL_API_TOKEN }
      : {};
  }

  private getLocalFallbackUrl(baseUrl: string): string | null {
    try {
      const parsed = new URL(baseUrl);
      if (!DOCKER_SERVICE_HOSTS.has(parsed.hostname)) {
        return null;
      }
      parsed.hostname = "127.0.0.1";
      return parsed.toString().replace(/\/+$/, "");
    } catch {
      return null;
    }
  }

  private isDnsNotFoundError(error: any): boolean {
    return (
      error?.code === "ENOTFOUND" ||
      error?.cause?.code === "ENOTFOUND" ||
      (typeof error?.message === "string" && error.message.includes("ENOTFOUND"))
    );
  }

  private async requestWithHostFallback<T>(
    baseUrl: string,
    executor: (resolvedBaseUrl: string) => Promise<T>,
  ): Promise<T> {
    const cleanBase = baseUrl.replace(/\/+$/, "");
    try {
      return await executor(cleanBase);
    } catch (error: any) {
      if (!this.isDnsNotFoundError(error)) {
        throw error;
      }
      const fallbackUrl = this.getLocalFallbackUrl(cleanBase);
      if (!fallbackUrl) {
        throw error;
      }
      console.warn(
        `[PythonBridge] Host '${cleanBase}' not resolvable outside Docker; retrying via ${fallbackUrl}`,
      );
      return await executor(fallbackUrl);
    }
  }

  private buildBridgeError(
    serviceName: string,
    error: any,
    fallbackMessage: string,
  ): BridgeError {
    const upstreamStatus: number | undefined = error?.response?.status;
    const rawDetail = error?.response?.data?.detail;
    const detailMessage = Array.isArray(rawDetail)
      ? rawDetail.map((d: any) => d?.msg || JSON.stringify(d)).join("; ")
      : typeof rawDetail === "string"
        ? rawDetail
        : undefined;

    let message =
      detailMessage ||
      error?.response?.data?.error ||
      error?.message ||
      fallbackMessage;

    if (!upstreamStatus && error?.code === "ECONNREFUSED") {
      message = `${serviceName} is not running (${message}). Start the microservice on its configured port or via Docker Compose.`;
    }

    console.error(`[PythonBridge: ${serviceName} Error]`, message);

    const err: BridgeError = new Error(`${serviceName} error: ${message}`);
    if (upstreamStatus && upstreamStatus >= 400 && upstreamStatus < 500) {
      err.statusCode = upstreamStatus;
    } else if (upstreamStatus && upstreamStatus >= 500) {
      err.statusCode = upstreamStatus === 503 ? 503 : 502;
    } else {
      err.statusCode = 503;
    }
    return err;
  }

  /**
   * Triggers LLM extraction, deterministic substring verification,
   * freshness calculation, and gap question generation in ai-engine.
   */
  async triggerExtractionAndVerify(
    projectId: string,
    options?: TriggerExtractionOptions,
  ): Promise<ExtractionResponse> {
    try {
      const payload: Record<string, any> = { projectId };
      if (options?.sourceRecords) {
        payload.sourceRecords = options.sourceRecords;
      }
      if (options?.databaseName) {
        payload.databaseName = options.databaseName;
      }

      return await this.requestWithHostFallback(this.aiBaseUrl, async (base) => {
        const response = await axios.post<ExtractionResponse>(
          `${base}/internal/extract-and-verify`,
          payload,
          {
            headers: this.getInternalHeaders(),
            timeout: 120000, // 2 min timeout for LLM batch calls
          },
        );
        return response.data;
      });
    } catch (error: any) {
      throw this.buildBridgeError(
        "AI Engine",
        error,
        "Failed to contact AI Engine",
      );
    }
  }

  /**
   * Validates a single finding claim & excerpt against MongoDB source_records
   * (or explicit source_text) via ai-engine.
   */
  async validateFindingEvidence(
    payload: EvidenceValidationPayload,
  ): Promise<EvidenceValidationResponse> {
    try {
      return await this.requestWithHostFallback(this.aiBaseUrl, async (base) => {
        const response = await axios.post<EvidenceValidationResponse>(
          `${base}/api/v1/evidence/validate`,
          payload,
          {
            headers: this.getInternalHeaders(),
            timeout: 15000,
          },
        );
        return response.data;
      });
    } catch (error: any) {
      throw this.buildBridgeError(
        "AI Engine",
        error,
        "Failed to validate evidence with AI Engine",
      );
    }
  }

  /**
   * Scans a project's findings in MongoDB for stale source timestamps via ai-engine.
   */
  async scanProjectFreshness(
    projectId: string,
    maxAgeDays = 90,
    limit = 500,
  ): Promise<FreshnessScanResponse> {
    try {
      return await this.requestWithHostFallback(this.aiBaseUrl, async (base) => {
        const response = await axios.post<FreshnessScanResponse>(
          `${base}/api/v1/evidence/freshness/scan`,
          {
            projectId,
            max_age_days: maxAgeDays,
            limit,
          },
          {
            headers: this.getInternalHeaders(),
            timeout: 30000,
          },
        );
        return response.data;
      });
    } catch (error: any) {
      throw this.buildBridgeError(
        "AI Engine",
        error,
        "Failed to scan findings freshness with AI Engine",
      );
    }
  }

  /**
   * Phrases a focused gap question via ai-engine for Unknown/Conflicting evidence.
   */
  async generateGapQuestion(
    topic: string,
    status: VerificationStatus,
    conflictingValues?: string[],
  ): Promise<GapQuestionGenerationResponse> {
    try {
      return await this.requestWithHostFallback(this.aiBaseUrl, async (base) => {
        const response = await axios.post<GapQuestionGenerationResponse>(
          `${base}/api/v1/questions/generate`,
          {
            topic,
            status,
            conflicting_values: conflictingValues,
          },
          {
            headers: this.getInternalHeaders(),
            timeout: 15000,
          },
        );
        return response.data;
      });
    } catch (error: any) {
      throw this.buildBridgeError(
        "AI Engine",
        error,
        "Failed to generate gap question with AI Engine",
      );
    }
  }

  /**
   * Checks ai-engine /health readiness and MongoDB connectivity.
   */
  async checkAiEngineHealth(): Promise<AIEngineHealthResponse> {
    try {
      return await this.requestWithHostFallback(this.aiBaseUrl, async (base) => {
        const response = await axios.get<AIEngineHealthResponse>(
          `${base}/health`,
          { timeout: 5000 },
        );
        return response.data;
      });
    } catch (error: any) {
      throw this.buildBridgeError(
        "AI Engine",
        error,
        "AI Engine healthcheck failed",
      );
    }
  }

  /**
   * Checks analytics-service /health readiness and store mode.
   */
  async checkAnalyticsHealth(): Promise<AnalyticsHealthResponse> {
    try {
      return await this.requestWithHostFallback(
        this.analyticsBaseUrl,
        async (base) => {
          const response = await axios.get<AnalyticsHealthResponse>(
            `${base}/health`,
            { timeout: 5000 },
          );
          return response.data;
        },
      );
    } catch (error: any) {
      throw this.buildBridgeError(
        "Analytics Service",
        error,
        "Analytics Service healthcheck failed",
      );
    }
  }

  /**
   * Triggers Git contribution risk mapping and 7-point readiness checklist evaluation in analytics-service.
   */
  async computeRiskAndReadiness(
    projectId: string,
  ): Promise<RiskAndReadinessResponse> {
    try {
      return await this.requestWithHostFallback(
        this.analyticsBaseUrl,
        async (base) => {
          const response = await axios.post<RiskAndReadinessResponse>(
            `${base}/internal/compute-risk-and-readiness`,
            { projectId },
            {
              headers: this.getInternalHeaders(),
              timeout: 30000,
            },
          );
          return response.data;
        },
      );
    } catch (error: any) {
      throw this.buildBridgeError(
        "Analytics Service",
        error,
        "Failed to contact Analytics Service",
      );
    }
  }

  /**
   * Proxies binary ReportLab PDF generation stream from analytics-service.
   */
  async getPdfStream(
    projectId: string,
    options?: { allowDraft?: boolean },
  ): Promise<AxiosResponse<Readable>> {
    try {
      return await this.requestWithHostFallback(
        this.analyticsBaseUrl,
        async (base) => {
          return await axios.get<Readable>(
            `${base}/internal/generate-pdf/${projectId}`,
            {
              headers: this.getInternalHeaders(),
              params: options?.allowDraft ? { allow_draft: true } : undefined,
              responseType: "stream",
              timeout: 60000,
            },
          );
        },
      );
    } catch (error: any) {
      throw this.buildBridgeError(
        "PDF generation",
        error,
        "Failed to generate handover PDF",
      );
    }
  }
}

export const pythonBridge = new PythonBridge();
