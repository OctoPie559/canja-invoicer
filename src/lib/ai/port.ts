/**
 * AI port (ARCHITECTURE.md §1.4): the only surface the ask services see.
 * Keeps `lib/services` pure and testable — tests inject a mock, the transport
 * injects the OpenAI adapter. The port is deliberately dumb: extraction,
 * streamed prose, embeddings. No tools, no agent loop — Ask Canja's LLMs only
 * classify and rephrase; every fact comes from our own org-scoped queries.
 */

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AiPort {
  /** Model id recorded on the message row for cost telemetry. */
  readonly chatModel: string;

  /**
   * One-shot extraction constrained to a strict JSON schema. Returns the raw
   * text — the CALLER re-parses with Zod (server-authoritative validation;
   * the provider's schema enforcement is best-effort, not trusted).
   */
  extractJson(opts: {
    system: string;
    messages: AiMessage[];
    schemaName: string;
    schema: Record<string, unknown>;
    maxTokens: number;
  }): Promise<{ text: string; usage: AiUsage }>;

  /** Streamed prose. `onToken` fires per delta; resolves with the full text. */
  streamText(opts: {
    system: string;
    messages: AiMessage[];
    maxTokens: number;
    onToken?: (token: string) => void;
  }): Promise<{ text: string; usage: AiUsage }>;

  /** Batch embeddings (Lane 2). Vectors ordered like the input texts. */
  embed(texts: string[]): Promise<{ vectors: number[][]; tokens: number }>;
}
