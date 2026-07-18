import OpenAI from "openai";
import type { AiMessage, AiPort, AiUsage } from "./port";

/**
 * OpenAI adapter for the AiPort (user decision 2026-07-16: single provider).
 * Model ids are env-overridable config — pricing/lineup drift is a config
 * edit, not a code change. Defaults verified against openai pricing
 * 2026-07-17: gpt-5.4-nano $0.20/$1.25 per MTok (router + answerer are
 * classification and verbatim rephrasing — nano-tier work).
 *
 * No temperature is sent: current reasoning-tier models reject non-default
 * sampling params, and determinism comes from strict schemas + prompts.
 */

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-5.4-nano";
const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL ?? "text-embedding-3-small";

function usageOf(u: {
  prompt_tokens?: number;
  completion_tokens?: number;
} | null | undefined): AiUsage {
  return {
    inputTokens: u?.prompt_tokens ?? 0,
    outputTokens: u?.completion_tokens ?? 0,
  };
}

export function createOpenAiPort(apiKey = process.env.OPENAI_API_KEY): AiPort {
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const client = new OpenAI({ apiKey });

  const toChat = (system: string, messages: AiMessage[]) => [
    { role: "system" as const, content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  return {
    chatModel: CHAT_MODEL,

    async extractJson({ system, messages, schemaName, schema, maxTokens }) {
      const res = await client.chat.completions.create({
        model: CHAT_MODEL,
        max_completion_tokens: maxTokens,
        messages: toChat(system, messages),
        response_format: {
          type: "json_schema",
          json_schema: { name: schemaName, strict: true, schema },
        },
      });
      return {
        text: res.choices[0]?.message?.content ?? "",
        usage: usageOf(res.usage),
      };
    },

    async streamText({ system, messages, maxTokens, onToken }) {
      const stream = await client.chat.completions.create({
        model: CHAT_MODEL,
        max_completion_tokens: maxTokens,
        messages: toChat(system, messages),
        stream: true,
        stream_options: { include_usage: true },
      });
      let text = "";
      let usage: AiUsage = { inputTokens: 0, outputTokens: 0 };
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          text += delta;
          onToken?.(delta);
        }
        if (chunk.usage) usage = usageOf(chunk.usage);
      }
      return { text, usage };
    },

    async embed(texts) {
      const res = await client.embeddings.create({
        model: EMBED_MODEL,
        input: texts,
      });
      return {
        vectors: res.data
          .sort((a, b) => a.index - b.index)
          .map((d) => d.embedding),
        tokens: res.usage?.prompt_tokens ?? 0,
      };
    },
  };
}
