import path from "path";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

/**
 * Extracts raw textual content from uploaded meeting notes (.pdf, .docx, .txt).
 */
export const extractDocumentText = async (
  buffer: Buffer,
  filename: string
): Promise<string> => {
  const ext = path.extname(filename).toLowerCase();

  switch (ext) {
    case ".pdf": {
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        return result.text || "";
      } finally {
        await parser.destroy();
      }
    }

    case ".docx": {
      const result = await mammoth.extractRawText({ buffer });
      return result.value || "";
    }

    case ".txt": {
      return buffer.toString("utf-8");
    }

    default:
      throw new Error(`Unsupported document extension for parsing: ${ext}`);
  }
};

