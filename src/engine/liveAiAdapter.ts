import { sortModelsFreeFirst } from "./providers";
import type {
  AiGenerateRequest,
  AiGenerateResult,
  AiModelOption,
  AiProviderAdapter,
  AiProviderSettings,
} from "./types";

type FetchLike = typeof fetch;

function isZeroPrice(value: unknown): boolean {
  if (value === 0) return true;
  if (typeof value !== "string" || !value.trim()) return false;
  return Number(value) === 0;
}

function finalizeModels(models: AiModelOption[]): AiModelOption[] {
  const seen = new Set<string>();
  const deduped: AiModelOption[] = [];
  for (const model of models) {
    const id = model.id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push({ ...model, id, label: model.label.trim() || id });
  }
  return sortModelsFreeFirst(deduped);
}

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
  async function requestJson(url: string, init: RequestInit): Promise<unknown> {
    const res = await fetchFn(url, init);
    const raw = await res.text();
    if (!res.ok) {
      throw new Error(extractErrorMessage(res.status, raw));
    }
    return raw ? (JSON.parse(raw) as unknown) : {};
  }

  function getJson(
    url: string,
    headers: Record<string, string>,
  ): Promise<unknown> {
    return requestJson(url, { method: "GET", headers });
  }

  function postJson(
    url: string,
    headers: Record<string, string>,
    body: unknown,
  ): Promise<unknown> {
    return requestJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
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

    async listModels(settings: AiProviderSettings): Promise<AiModelOption[]> {
      const { aiProvider, apiKey, baseUrl } = settings;
      const base = baseUrl.replace(/\/+$/, "");

      if (aiProvider === "gemini") {
        const payload = (await getJson(`${base}/models`, {
          "x-goog-api-key": apiKey,
        })) as {
          models?: Array<{
            name?: string;
            displayName?: string;
            supportedGenerationMethods?: string[];
          }>;
        };
        const models = (payload.models ?? [])
          .filter(
            (m) =>
              !m.supportedGenerationMethods ||
              m.supportedGenerationMethods.includes("generateContent"),
          )
          .map((m): AiModelOption => {
            const id = (m.name ?? "").replace(/^models\//, "");
            const label = m.displayName || id;
            const isFree = /flash|gemma/i.test(id);
            return isFree
              ? { id, label, isFree: true, freeBadge: "Free tier" }
              : { id, label };
          });
        return finalizeModels(models);
      }

      if (aiProvider === "anthropic") {
        const payload = (await getJson(`${base}/models`, {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        })) as {
          data?: Array<{ id?: string; display_name?: string }>;
        };
        return finalizeModels(
          (payload.data ?? []).map((m) => ({
            id: m.id ?? "",
            label: m.display_name || m.id || "",
          })),
        );
      }

      if (aiProvider === "ollama") {
        const tagsBase = base.replace(/\/v1$/, "");
        try {
          const tagsPayload = (await getJson(`${tagsBase}/api/tags`, {})) as {
            models?: Array<{ name?: string; model?: string }>;
          };
          const fromTags = finalizeModels(
            (tagsPayload.models ?? []).map((m) => {
              const id = m.name || m.model || "";
              return { id, label: id, isFree: true, freeBadge: "Free · Local" };
            }),
          );
          if (fromTags.length > 0) return fromTags;
        } catch {
          // Fall back to OpenAI-compatible /models endpoint.
        }
        const headers: Record<string, string> = {};
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
        const fallbackPayload = (await getJson(`${base}/models`, headers)) as {
          data?: Array<{ id?: string }>;
        };
        return finalizeModels(
          (fallbackPayload.data ?? []).map((m) => ({
            id: m.id ?? "",
            label: m.id ?? "",
            isFree: true,
            freeBadge: "Free · Local",
          })),
        );
      }

      const headers: Record<string, string> = {};
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      const payload = (await getJson(`${base}/models`, headers)) as {
        data?: Array<{
          id?: string;
          name?: string;
          pricing?: { prompt?: string | number; completion?: string | number };
        }>;
      };

      if (aiProvider === "openrouter") {
        return finalizeModels(
          (payload.data ?? []).map((m): AiModelOption => {
            const id = m.id ?? "";
            const label = m.name || id;
            const isFree =
              id.endsWith(":free") ||
              (isZeroPrice(m.pricing?.prompt) &&
                isZeroPrice(m.pricing?.completion));
            return isFree
              ? { id, label, isFree: true, freeBadge: "Free" }
              : { id, label };
          }),
        );
      }

      return finalizeModels(
        (payload.data ?? []).map((m) => ({
          id: m.id ?? "",
          label: m.name || m.id || "",
        })),
      );
    },
  };
}
