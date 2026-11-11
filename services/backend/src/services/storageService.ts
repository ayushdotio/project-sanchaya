import ImageKit, { toFile } from "@imagekit/nodejs";
import path from "node:path";
import { env } from "../config/env.js";

export interface UploadDocumentParams {
  buffer: Buffer;
  fileName: string;
  projectId?: string;
  folder?: string;
  tags?: string[];
  useUniqueFileName?: boolean;
}

export interface UploadedDocumentResult {
  fileId: string;
  name: string;
  url: string;
  filePath: string;
  size: number;
}

export interface StoredDocumentItem {
  fileId: string;
  name: string;
  url: string;
  filePath: string;
  size: number;
  mime: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

/**
 * Storage service wrapping the official ImageKit Node.js SDK (`@imagekit/nodejs`).
 * Lazily initializes the client so the backend boots even when ImageKit credentials
 * are not configured yet, while failing fast if a storage operation is invoked without them.
 */
export class StorageService {
  private client: ImageKit | null = null;

  private getClient(): ImageKit {
    if (this.client) {
      return this.client;
    }

    const privateKey = env.IMAGEKIT_PRIVATE_KEY?.trim();
    if (!privateKey) {
      const err = new Error(
        "ImageKit is not configured. Set IMAGEKIT_PRIVATE_KEY in the root .env file.",
      ) as Error & { statusCode?: number };
      err.statusCode = 503;
      throw err;
    }

    this.client = new ImageKit({ privateKey });
    return this.client;
  }

  /**
   * Returns the canonical ImageKit folder path for a project: `/sanchaya/<projectId>`.
   */
  getProjectFolder(projectId: string): string {
    const safeProjectId = path.basename(projectId).replace(/[^a-zA-Z0-9_-]/g, "");
    if (!safeProjectId) {
      throw new Error("Valid projectId is required to resolve ImageKit folder");
    }
    return `/sanchaya/${safeProjectId}`;
  }

  /**
   * Uploads an in-memory document buffer (e.g. from Multer) to ImageKit
   * under `/sanchaya/<projectId>` when `projectId` is provided.
   */
  async uploadDocument({
    buffer,
    fileName,
    projectId,
    folder,
    tags,
    useUniqueFileName = true,
  }: UploadDocumentParams): Promise<UploadedDocumentResult> {
    if (!buffer || buffer.length === 0) {
      throw new Error("Cannot upload an empty file buffer to ImageKit");
    }

    const sanitizedName = path.basename(fileName).trim() || "document";
    const targetFolder =
      folder ?? (projectId ? this.getProjectFolder(projectId) : "/sanchaya");

    const client = this.getClient();
    const uploadable = await toFile(buffer, sanitizedName);

    const response = await client.files.upload({
      file: uploadable,
      fileName: sanitizedName,
      folder: targetFolder,
      useUniqueFileName,
      ...(tags && tags.length > 0 ? { tags } : {}),
    });

    if (!response.fileId || !response.url) {
      throw new Error("ImageKit upload did not return fileId and url");
    }

    return {
      fileId: response.fileId,
      name: response.name ?? sanitizedName,
      url: response.url,
      filePath: response.filePath ?? "",
      size: response.size ?? buffer.length,
    };
  }

  /**
   * Lists all document files stored in `/sanchaya/<projectId>/` on ImageKit.
   */
  async listProjectDocuments(projectId: string): Promise<StoredDocumentItem[]> {
    const client = this.getClient();
    const folderPath = `${this.getProjectFolder(projectId)}/`;

    const files = await client.assets.list({
      path: folderPath,
      type: "file",
      sort: "DESC_CREATED",
    });

    return files.map((file) => ({
      fileId: file.fileId ?? "",
      name: file.name ?? "",
      url: file.url ?? "",
      filePath: file.filePath ?? "",
      size: file.size ?? 0,
      mime: file.mime ?? "",
      createdAt: file.createdAt ?? "",
      updatedAt: file.updatedAt ?? "",
      tags: file.tags ?? [],
    }));
  }

  /**
   * Fetches metadata and delivery URL for a single document on ImageKit by `fileId`.
   */
  async getDocumentDetails(fileId: string): Promise<StoredDocumentItem> {
    const trimmedId = fileId.trim();
    if (!trimmedId) {
      throw new Error("fileId is required to fetch a document from ImageKit");
    }

    const client = this.getClient();
    const file = await client.files.get(trimmedId);

    return {
      fileId: file.fileId ?? trimmedId,
      name: file.name ?? "",
      url: file.url ?? "",
      filePath: file.filePath ?? "",
      size: file.size ?? 0,
      mime: file.mime ?? "",
      createdAt: file.createdAt ?? "",
      updatedAt: file.updatedAt ?? "",
      tags: file.tags ?? [],
    };
  }

  /**
   * Deletes an uploaded document from ImageKit by its fileId.
   */
  async deleteDocument(fileId: string): Promise<void> {
    if (!fileId.trim()) {
      throw new Error("fileId is required to delete a file from ImageKit");
    }

    const client = this.getClient();
    await client.files.delete(fileId);
  }
}

export const storageService = new StorageService();
