import axios, { AxiosResponse } from "axios";
import { Readable } from "stream";
import { env } from "../config/env.js";

export interface ExtractionResponse {
  success: boolean;
  message?: string;
  findingsCount?: number;
  supportedCount?: number;
  gapsGenerated?: number;
  error?: string;
}

export interface RiskAndReadinessResponse {
  success: boolean;
  message?: string;
  readinessStatus?: string;
  checklist?: Record<string, boolean>;
  riskSummary?: Record<string, any>;
  error?: string;
}

export class PythonBridge {
  private aiBaseUrl: string;
  private analyticsBaseUrl: string;

  constructor() {
    this.aiBaseUrl = env.AI_SERVICE_URL;
    this.analyticsBaseUrl = env.ANALYTICS_SERVICE_URL;
  }

  /**
   * Triggers LLM extraction, deterministic substring verification,
   * freshness calculation, and gap question generation in ai-engine.
   */
  async triggerExtractionAndVerify(projectId: string): Promise<ExtractionResponse> {
    try {
      const response = await axios.post<ExtractionResponse>(
        `${this.aiBaseUrl}/internal/extract-and-verify`,
        { projectId },
        { timeout: 120000 } // 2 min timeout for LLM batch calls
      );
      return response.data;
    } catch (error: any) {
      const message = error.response?.data?.error || error.message || "Failed to contact AI Engine";
      console.error("[PythonBridge: AI Engine Error]", message);
      throw new Error(`AI Engine error: ${message}`);
    }
  }

  /**
   * Triggers Git contribution risk mapping and 7-point readiness checklist evaluation in analytics-service.
   */
  async computeRiskAndReadiness(projectId: string): Promise<RiskAndReadinessResponse> {
    try {
      const response = await axios.post<RiskAndReadinessResponse>(
        `${this.analyticsBaseUrl}/internal/compute-risk-and-readiness`,
        { projectId },
        { timeout: 30000 }
      );
      return response.data;
    } catch (error: any) {
      const message = error.response?.data?.error || error.message || "Failed to contact Analytics Service";
      console.error("[PythonBridge: Analytics Error]", message);
      throw new Error(`Analytics Service error: ${message}`);
    }
  }

  /**
   * Proxies binary ReportLab PDF generation stream from analytics-service.
   */
  async getPdfStream(projectId: string): Promise<AxiosResponse<Readable>> {
    try {
      return await axios.get<Readable>(
        `${this.analyticsBaseUrl}/internal/generate-pdf/${projectId}`,
        {
          responseType: "stream",
          timeout: 60000,
        }
      );
    } catch (error: any) {
      const message = error.response?.data?.error || error.message || "Failed to generate handover PDF";
      console.error("[PythonBridge: PDF Export Error]", message);
      throw new Error(`PDF generation error: ${message}`);
    }
  }
}

export const pythonBridge = new PythonBridge();

