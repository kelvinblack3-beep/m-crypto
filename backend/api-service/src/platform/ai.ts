import type { Bindings } from "../env.js";
export type AiModel =
  | "chat"
  | "gemini-3-8-flash"
  | "image"
  | "speech"
  | "seedance"
  | "kling"
  | "transcribe"
  | "voice-change";
export interface AiMedia {
  type: "image" | "video" | "audio" | "document";
  data: string;
}
export interface AiInput {
  model: AiModel;
  prompt?: string;
  media?: AiMedia[];
  maxTokens?: number;
  seconds?: number;
  generateAudio?: boolean;
  /** ElevenLabs voice ID for speech; voice name for voice-change. */
  voice?: string;
  dialogue?: { text: string; voice: string }[];
  endImage?: number;
  elements?: { imageIndices?: number[]; videoIndex?: number }[];
  task?: "reference" | "editing" | "extension";
  resolution?: "480p" | "720p" | "1080p";
  aspectRatio?: "auto" | "21:9" | "16:9" | "4:3" | "1:1" | "3:4" | "9:16";
  width?: number;
  height?: number;
  responseFormat?: "text" | "json";
  languageCode?: string;
  diarize?: boolean;
}
/** Convert an uploaded file to an inline reference without publishing it or exposing keys. */
export async function aiMedia(file: Blob): Promise<AiMedia> {
  if (!file.size || file.size > 16 * 1024 * 1024)
    throw new Error("Media must be between 1 byte and 16 MiB.");
  const mime = file.type === "audio/x-wav" ? "audio/wav" : file.type;
  const type = mime === "application/pdf" ? "document" : mime.split("/")[0];
  if (
    ![
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
      "video/mp4",
      "video/quicktime",
      "audio/mpeg",
      "audio/wav",
    ].includes(mime)
  )
    throw new Error("Unsupported media format.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return {
    type: type as AiMedia["type"],
    data: `data:${mime};base64,${btoa(binary)}`,
  };
}
export interface AiJob {
  id: string;
  model: AiModel;
  status:
    | "queued"
    | "submitting"
    | "running"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "reconciling";
  reservedCredits: number;
  chargedCredits: number | null;
  hasOutput: boolean;
  outputMime: string | null;
  error: string | null;
}
export class NewlyAiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
/** Server-only client. subject must come from authMiddleware's verified userId. */
export function newlyAi(
  env: Pick<Bindings, "NEWLY_AI_URL" | "NEWLY_AI_TOKEN">,
  subject: string,
) {
  async function request(path: string, init: RequestInit = {}) {
    if (!env.NEWLY_AI_URL || !env.NEWLY_AI_TOKEN)
      throw new NewlyAiError(
        "ai_not_enabled",
        "Enable App AI and deploy the backend.",
        503,
      );
    const response = await fetch(
      `${env.NEWLY_AI_URL.replace(/\/+$/, "")}/app-ai/v1${path}`,
      {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.NEWLY_AI_TOKEN}`,
          "X-Newly-AI-Subject": subject,
          ...init.headers,
        },
      },
    );
    if (!response.ok) {
      const data = (await response.json()) as {
        error?: { code?: string; message?: string };
      };
      throw new NewlyAiError(
        data.error?.code ?? "provider_unavailable",
        data.error?.message ?? "AI generation unavailable.",
        response.status,
      );
    }
    return response;
  }
  return {
    async quote(
      input: AiInput,
    ): Promise<{ maximumCredits: number; priceVersion: string }> {
      return (
        await request("/quote", { method: "POST", body: JSON.stringify(input) })
      ).json();
    },
    async generate(input: AiInput, idempotencyKey: string): Promise<AiJob> {
      return (
        await request("/jobs", {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey },
          body: JSON.stringify(input),
        })
      ).json();
    },
    async *streamText(
      input: {
        prompt: string;
        maxTokens?: number;
        media?: AiMedia[];
        model?: "chat" | "gemini-3-8-flash";
      },
      idempotencyKey: string,
      signal?: AbortSignal,
    ): AsyncGenerator<string, AiJob> {
      const job = (await (
        await request("/jobs", {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey },
          body: JSON.stringify({ ...input, model: input.model ?? "chat" }),
          ...(signal ? { signal } : {}),
        })
      ).json()) as AiJob;
      let offset = 0;
      for (;;) {
        const response = await request(
          `/jobs/${encodeURIComponent(job.id)}/events?offset=${offset}`,
          signal ? { signal } : {},
        );
        const reader = response.body?.getReader();
        if (!reader)
          throw new NewlyAiError(
            "stream_unavailable",
            "Missing AI stream.",
            503,
          );
        const decoder = new TextDecoder();
        let pending = "";
        try {
          for (;;) {
            const part = await reader.read();
            if (part.done) break;
            pending += decoder.decode(part.value, { stream: true });
            let newline: number;
            while ((newline = pending.indexOf("\n")) >= 0) {
              const line = pending.slice(0, newline).trim();
              pending = pending.slice(newline + 1);
              if (!line.startsWith("data:")) continue;
              const event = JSON.parse(line.slice(5)) as {
                type: string;
                text?: string;
                code?: string;
                job?: AiJob;
              };
              if (event.type === "delta" && typeof event.text === "string") {
                offset += event.text.length;
                yield event.text;
              }
              if (event.type === "done" && event.job) return event.job;
              if (event.type === "error")
                throw new NewlyAiError(
                  event.code ?? "stream_unavailable",
                  "AI generation could not finish. Check the job before retrying.",
                  503,
                );
            }
          }
        } finally {
          await reader.cancel().catch(() => {});
        }
      }
    },
    async get(id: string): Promise<AiJob> {
      return (await request(`/jobs/${encodeURIComponent(id)}`)).json();
    },
    async cancel(id: string): Promise<AiJob> {
      return (
        await request(`/jobs/${encodeURIComponent(id)}/cancel`, {
          method: "POST",
          body: "{}",
        })
      ).json();
    },
    async output(id: string): Promise<Response> {
      return request(`/jobs/${encodeURIComponent(id)}/output`);
    },
  };
}
