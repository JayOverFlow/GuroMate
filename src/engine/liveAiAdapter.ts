import type {
  AiGenerateRequest,
  AiGenerateResult,
  AiProviderAdapter,
} from "./types";

type FetchLike = typeof fetch;

function extractErrorMessage(status: number, bodyText: string): string {
  try {
    const json = JSON.parse(bodyText) as {
      error?: { message?: string } | string;
      message?: string;
    };
    if (typeof json.error === "string") return `HTTP ${status}: ${json.error}`;
    if (json.error?.message) return `HTTP ${status}: ${json.error.message}`;
    if (json.message) return `HTTP ${status}: ${json.message}`;
  } catch {
    // Fall back to raw response text when provider does not return JSON.
  }
  const snippet = bodyText.trim().slice(0, 200);
  return snippet ? `HTTP ${status}: ${snippet}` : `HTTP ${status}`;
}

/** Creates an HTTP AI Provider Adapter for OpenAI-compatible, OpenRouter, Ollama, Gemini, and Anthropic. */
export function createLiveAiAdapter(
  fetchFn: FetchLike = fetch,
): AiProviderAdapter {
  async function postJson(
    url: string,
    headers: Record<string, string>,
    body: unknown,
  ): Promise<unknown> {
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    if (!res.ok) {
      throw new Error(extractErrorMessage(res.status, raw));
    }
    return raw ? (JSON.parse(raw) as unknown) : {};
  }

  return {
    async generateText(request: AiGenerateRequest): Promise<AiGenerateResult> {
      const { aiProvider, apiKey, baseUrl, modelId } = request.settings;
      const base = baseUrl.replace(/\/+$/, "");
      const system = request.systemInstruction?.trim();

      if (aiProvider === "gemini") {
        const url = `${base}/models/${encodeURIComponent(modelId)}:generateContent`;
        const payload = (await postJson(
          url,
          { "x-goog-api-key": apiKey },
          {
            ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
            contents: [{ role: "user", parts: [{ text: request.prompt }] }],
          },
        )) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
          }>;
        };
        const text =
          payload.candidates?.[0]?.content?.parts
            ?.map((p) => p.text ?? "")
            .join("") ?? "";
        if (!text) throw new Error("Gemini returned an empty response.");
        return { text, model: modelId };
      }

      if (aiProvider === "anthropic") {
        const payload = (await postJson(
          `${base}/messages`,
          {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          {
            model: modelId,
            max_tokens: 8192,
            ...(system ? { system } : {}),
            messages: [{ role: "user", content: request.prompt }],
          },
        )) as {
          model?: string;
          content?: Array<{ type?: string; text?: string }>;
        };
        const text =
          payload.content
            ?.filter((c) => c.type === "text")
            .map((c) => c.text ?? "")
            .join("") ?? "";
        if (!text) throw new Error("Anthropic returned an empty response.");
        return { text, model: payload.model ?? modelId };
      }

      const headers: Record<string, string> = {};
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

      const payload = (await postJson(`${base}/chat/completions`, headers, {
        model: modelId,
        messages: [
          ...(system ? [{ role: "system", content: system }] : []),
          { role: "user", content: request.prompt },
        ],
      })) as {
        model?: string;
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = payload.choices?.[0]?.message?.content ?? "";
      if (!text) throw new Error(`${aiProvider} returned an empty response.`);
      return { text, model: payload.model ?? modelId };
    },
  };
}
