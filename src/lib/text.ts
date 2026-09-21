/** Remove tracking URLs, bare domains, markdown image syntax, and angle-bracketed links. */
export function stripNoise(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/<https?:\/\/[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\bwww\.\S+/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Redact one-time passcodes, verification codes, credit cards, and sensitive tokens. */
export function redactSensitiveData(text: string): string {
  return text
    // Credit card patterns: 13-19 digits with optional spaces or dashes
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[REDACTED_CARD]")
    // Labeled codes/OTPs/PINs: e.g. "code: 123456", "OTP is 987654", "pin: 1234"
    .replace(/(?:\b(?:code|otp|pin|passcode|token|verification|security code)[\s:=#\-]+)([a-zA-Z0-9]{4,10})\b/gi, "$1 [REDACTED_CODE]")
    // Standalone 6-digit numeric verification codes
    .replace(/\b\d{6}\b/g, "[REDACTED_CODE]");
}

