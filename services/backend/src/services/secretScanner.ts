export interface ScanResult {
  redactedText: string;
  redactionCount: number;
}

/**
 * Stage 1 Gate: Pre-AI Deterministic Secret & PII Redaction Engine.
 * Must run on ALL ingested text BEFORE persistence to MongoDB or transmission to LLMs.
 */
export const scanAndRedact = (rawText: string): ScanResult => {
  if (!rawText || typeof rawText !== "string") {
    return { redactedText: "", redactionCount: 0 };
  }

  let text = rawText;
  let redactionCount = 0;

  const countAndReplace = (regex: RegExp, replacement: string) => {
    const matches = text.match(regex);
    if (matches) {
      redactionCount += matches.length;
      text = text.replace(regex, replacement);
    }
  };

  // 1. Private Key Blocks (PEM, RSA, OpenSSH, PGP)
  const privateKeyPattern =
    /-----BEGIN[ A-Z0-9_-]+PRIVATE KEY-----[a-zA-Z0-9\/\+=\r\n\s]+?-----END[ A-Z0-9_-]+PRIVATE KEY-----/g;
  countAndReplace(privateKeyPattern, "[REDACTED_SECRET]");

  // 2. Cloud & API Keys (AWS, OpenAI, Stripe, Slack, Anthropic)
  const apiKeyPatterns = [
    // AWS Access Key ID
    /\bAKIA[0-9A-Z]{16}\b/g,
    // AWS Secret Access Key (lookbehind or common variable assignment)
    /(?:aws_secret_access_key|aws_secret|secret_key)[\s:=]+['"]?([a-zA-Z0-9\/+=]{40})['"]?/gi,
    // OpenAI API Keys
    /\bsk-(?:proj-)?[a-zA-Z0-9_-]{20,60}\b/g,
    // Stripe Live & Test Secret Keys
    /\b(?:sk_live|rk_live|sk_test)_[0-9a-zA-Z]{24,34}\b/g,
    // Slack Tokens (xoxb, xoxp, xapp)
    /\bxox[baprs]-[0-9a-zA-Z-]{10,48}\b/g,
    // Generic Bearer Tokens
    /Bearer\s+[a-zA-Z0-9_\-\.]{24,}/gi,
  ];

  for (const pattern of apiKeyPatterns) {
    countAndReplace(pattern, "[REDACTED_SECRET]");
  }

  // 3. GitHub Tokens (Personal Access Tokens, Fine-grained, OAuth)
  const githubPatterns = [
    /\bghp_[a-zA-Z0-9]{36}\b/g,
    /\bgithub_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}\b/g,
    /\bgho_[a-zA-Z0-9]{36}\b/g,
    /\bghs_[a-zA-Z0-9]{36}\b/g,
    /\bghr_[a-zA-Z0-9]{36}\b/g,
  ];

  for (const pattern of githubPatterns) {
    countAndReplace(pattern, "[REDACTED_SECRET]");
  }

  // 4. Config & .env Assignments (JWT_SECRET, PASSWORD, MONGO_URI, PRIVATE_KEY)
  const envSecretPattern =
    /(?:JWT_SECRET|PASSWORD|MONGO_URI|PRIVATE_KEY|DATABASE_URL|CLIENT_SECRET)[\s]*=[\s]*['"]?([^\s\r\n'"]+)['"]?/gi;
  text = text.replace(
    envSecretPattern,
    (match, capturedValue) => {
      redactionCount++;
      return match.replace(capturedValue, "[REDACTED_SECRET]");
    }
  );

  // 5. Personal Identifiable Information (PII)
  // Email addresses
  const emailPattern =
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  countAndReplace(emailPattern, "[REDACTED_PII]");

  // Phone numbers (International and standard formats)
  const phonePattern =
    /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
  countAndReplace(phonePattern, "[REDACTED_PII]");

  // IPv4 addresses (excluding localhost and standard private loopback)
  const ipv4Pattern =
    /\b(?!127\.0\.0\.1)(?!0\.0\.0\.0)(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
  countAndReplace(ipv4Pattern, "[REDACTED_PII]");

  return {
    redactedText: text,
    redactionCount,
  };
};

