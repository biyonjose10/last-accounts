// The only place the model is called. A failure here never moves money: callers fall back and money stays held.

import { GoogleGenAI } from "@google/genai";
import type { z } from "zod";

export const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";

export class AiUnavailable extends Error {
  constructor(
    message: string,
    readonly code: "NO_KEY" | "RATE_LIMITED" | "MODEL_ERROR" | "BAD_OUTPUT" | "FORCED",
  ) {
    super(message);
  }
}

interface Ask<T> {
  system: string;
  prompt: string;
  image?: { mimeType: string; base64: string };
  schema: z.ZodType<T>;
  jsonSchema: Record<string, unknown>;
  /** Fault drill: behave as if the model is down. */
  forceFailure?: boolean;
}

export async function askModel<T>(ask: Ask<T>): Promise<T> {
  if (ask.forceFailure) throw new AiUnavailable("AI switched off for this drill.", "FORCED");
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AiUnavailable("No AI key is configured.", "NO_KEY");

  const client = new GoogleGenAI({ apiKey: key });
  const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [{ text: ask.prompt }];
  if (ask.image) parts.push({ inlineData: { mimeType: ask.image.mimeType, data: ask.image.base64 } });

  let text: string | undefined;
  try {
    const res = await client.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: ask.system,
        responseMimeType: "application/json",
        responseJsonSchema: ask.jsonSchema,
        temperature: 0,
        maxOutputTokens: 4000,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    text = res.text;
  } catch (err) {
    const status = (err as { status?: number }).status;
    const message = String((err as Error).message ?? "");
    if (status === 429 || /RESOURCE_EXHAUSTED|rate/i.test(message)) {
      throw new AiUnavailable("The AI's free quota is used up for now.", "RATE_LIMITED");
    }
    throw new AiUnavailable("The AI couldn't be reached.", "MODEL_ERROR");
  }

  try {
    return ask.schema.parse(JSON.parse(text ?? ""));
  } catch (err) {
    // Logs which field failed, never the document's contents.
    const issues = (err as { issues?: { path: unknown[]; code: string }[] }).issues?.map((i) => `${i.path.join(".")}:${i.code}`);
    console.error("AI output rejected:", issues?.join(", ") ?? `not JSON, ${text?.length ?? 0} chars`);
    throw new AiUnavailable("The AI's answer didn't pass validation, so it was discarded.", "BAD_OUTPUT");
  }
}
