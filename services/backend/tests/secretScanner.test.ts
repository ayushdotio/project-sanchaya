import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scanAndRedact } from "../src/services/secretScanner.js";

describe("Metric 5: Pre-AI Secret & PII Redaction Pipeline", () => {
  it("should redact planted GitHub PATs with [REDACTED_SECRET]", () => {
    const raw = "Commit by dev. Used token ghp_1234567890abcdefghijklmnopqrstuvwxyz to push.";
    const { redactedText, redactionCount } = scanAndRedact(raw);

    assert.equal(redactedText.includes("ghp_1234567890abcdefghijklmnopqrstuvwxyz"), false);
    assert.equal(redactedText.includes("[REDACTED_SECRET]"), true);
    assert.equal(redactionCount, 1);
  });

  it("should redact OpenAI API keys with [REDACTED_SECRET]", () => {
    const raw = "Configuration: OPENAI_API_KEY=sk-proj-1234567890abcdef1234567890 in service worker.";
    const { redactedText, redactionCount } = scanAndRedact(raw);

    assert.equal(redactedText.includes("sk-proj-1234567890abcdef"), false);
    assert.equal(redactedText.includes("[REDACTED_SECRET]"), true);
    assert.ok(redactionCount >= 1);
  });

  it("should redact .env assignments with [REDACTED_SECRET]", () => {
    const raw = "JWT_SECRET=my_leaked_secret_value\nDATABASE_URL=mongodb://root:pass@mongo:27017";
    const { redactedText, redactionCount } = scanAndRedact(raw);

    assert.equal(redactedText.includes("my_leaked_secret_value"), false);
    assert.equal(redactedText.includes("JWT_SECRET=[REDACTED_SECRET]"), true);
    assert.ok(redactionCount >= 1);
  });

  it("should redact personal email addresses with [REDACTED_PII]", () => {
    const raw = "Please contact developer.private@gmail.com for technical handover questions.";
    const { redactedText, redactionCount } = scanAndRedact(raw);

    assert.equal(redactedText.includes("developer.private@gmail.com"), false);
    assert.equal(redactedText.includes("[REDACTED_PII]"), true);
    assert.equal(redactionCount, 1);
  });

  it("should redact combined synthetic payload with exact planted counts", () => {
    const plantedPayload = `
      Author: developer.private@gmail.com
      Sync Token: ghp_1234567890abcdefghijklmnopqrstuvwxyz
      Local Config: JWT_SECRET=my_leaked_secret_value
      External Service: Bearer sk-proj-1234567890abcdef1234567890
    `;

    const { redactedText, redactionCount } = scanAndRedact(plantedPayload);

    assert.equal(redactedText.includes("developer.private@gmail.com"), false);
    assert.equal(redactedText.includes("ghp_1234567890abcdefghijklmnopqrstuvwxyz"), false);
    assert.equal(redactedText.includes("my_leaked_secret_value"), false);
    assert.equal(redactedText.includes("sk-proj-1234567890abcdef"), false);
    assert.ok(redactionCount >= 4);
  });
});

