import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AI_PROVIDERS,
  AI_PROVIDER_MAP,
  getCuratedModels,
  isCustomModelId,
  resolveModelIdOnProviderChange,
} from "../engine/providers";
import type {
  AiConnectionCheckResult,
  AiModelListResult,
  AiModelOption,
  AiProviderType,
  GuroMateSettings,
} from "../engine/types";

export const CUSTOM_MODEL_OPTION = "__custom__";

const DEFAULT_BASE_URL_SET = new Set(
  AI_PROVIDERS.map((option) => option.defaultBaseUrl),
);

export interface SettingsStatusState {
  tone: "success" | "error";
  text: string;
}

export interface SignatoryFieldConfig {
  key: Exclude<keyof GuroMateSettings["profile"], "aiDeclaration">;
  label: string;
  errorText: string;
  autoComplete?: string;
}

export const SIGNATORY_FIELDS: readonly SignatoryFieldConfig[] = [
  {
    key: "studentTeacherName",
    label: "Pre-Service Teacher (Prepared by)",
    errorText: "Error: Enter the pre-service teacher name.",
    autoComplete: "name",
  },
  {
    key: "cooperatingTeacherName",
    label: "Cooperating Teacher (Checked by)",
    errorText: "Error: Enter the cooperating teacher name.",
  },
  {
    key: "tleCoordinatorName",
    label: "TLE Coordinator",
    errorText: "Error: Enter the TLE coordinator name.",
  },
  {
    key: "academicHeadName",
    label: "Academic Head Coordinator",
    errorText: "Error: Enter the Academic Head coordinator name.",
  },
];

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; message?: string };
    return data.error || data.message || `Request failed (HTTP ${res.status}).`;
  } catch {
    return `Request failed (HTTP ${res.status}).`;
  }
}

export function useSettingsWorkspace(
  onProfileSaved?: (settings: GuroMateSettings) => void,
) {
  const formRef = useRef<HTMLFormElement>(null);
  const [settings, setSettings] = useState<GuroMateSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [liveModels, setLiveModels] = useState<AiModelOption[] | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [status, setStatus] = useState<SettingsStatusState | null>(null);
  const [invalidFields, setInvalidFields] = useState<Record<string, boolean>>(
    {},
  );

  useEffect(() => {
    let active = true;
    void fetch("/api/settings")
      .then(async (res) => {
        if (!res.ok) throw new Error(await readErrorMessage(res));
        return (await res.json()) as GuroMateSettings;
      })
      .then((data) => {
        if (active) {
          setSettings(data);
          setIsCustomModel(
            isCustomModelId(data.ai.aiProvider, data.ai.modelId),
          );
        }
      })
      .catch((err) => {
        if (active) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      active = false;
    };
  }, []);

  function syncFieldValidity(
    el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  ): void {
    const fieldName = el.name;
    const isInvalid = !el.validity.valid;
    setInvalidFields((prev) =>
      prev[fieldName] === isInvalid ? prev : { ...prev, [fieldName]: isInvalid },
    );
  }

  function updateProfileField(
    key: keyof GuroMateSettings["profile"],
    value: string,
  ): void {
    setSettings((prev) =>
      prev ? { ...prev, profile: { ...prev.profile, [key]: value } } : prev,
    );
  }

  function updateProvider(nextProvider: AiProviderType): void {
    const option = AI_PROVIDER_MAP.get(nextProvider);
    if (!option || !settings) return;

    const currentUrl = settings.ai.baseUrl.trim();
    const shouldSwapUrl = !currentUrl || DEFAULT_BASE_URL_SET.has(currentUrl);
    const nextModelId = resolveModelIdOnProviderChange(
      settings.ai.modelId,
      nextProvider,
      liveModels?.map((m) => m.id),
    );

    setSettings((prev) =>
      prev
        ? {
            ...prev,
            ai: {
              ...prev.ai,
              aiProvider: nextProvider,
              baseUrl: shouldSwapUrl ? option.defaultBaseUrl : prev.ai.baseUrl,
              modelId: nextModelId,
            },
          }
        : prev,
    );
    setLiveModels(null);
    setIsCustomModel(isCustomModelId(nextProvider, nextModelId));
    setInvalidFields((prev) => ({ ...prev, apiKey: false, modelId: false }));
  }

  function selectModelOption(value: string): void {
    if (!settings) return;
    if (value === CUSTOM_MODEL_OPTION) {
      setIsCustomModel(true);
      const trimmed = settings.ai.modelId.trim();
      if (trimmed && availableModels.some((m) => m.id === trimmed)) {
        updateAiField("modelId", "");
      }
      setInvalidFields((prev) => ({ ...prev, modelId: false }));
      return;
    }

    setIsCustomModel(false);
    updateAiField("modelId", value);
    if (value.trim()) {
      setInvalidFields((prev) => ({ ...prev, modelId: false }));
    }
  }

  function updateAiField(
    key: "apiKey" | "baseUrl" | "modelId",
    value: string,
  ): void {
    setSettings((prev) =>
      prev ? { ...prev, ai: { ...prev.ai, [key]: value } } : prev,
    );
  }

  async function handleSave(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!settings) return;

    const form = formRef.current;
    if (form && !form.checkValidity()) {
      const nextInvalid: Record<string, boolean> = {};
      let firstInvalid: HTMLElement | null = null;
      for (const control of Array.from(form.elements)) {
        if (
          control instanceof HTMLInputElement ||
          control instanceof HTMLTextAreaElement ||
          control instanceof HTMLSelectElement
        ) {
          if (!control.validity.valid) {
            nextInvalid[control.name] = true;
            if (!firstInvalid) firstInvalid = control;
          }
        }
      }
      setInvalidFields(nextInvalid);
      firstInvalid?.focus();
      setStatus({
        tone: "error",
        text: "Error: Fix highlighted fields before saving.",
      });
      return;
    }

    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res));
      }
      const saved = (await res.json()) as GuroMateSettings;
      setSettings(saved);
      setInvalidFields({});
      onProfileSaved?.(saved);
      setStatus({
        tone: "success",
        text: "Settings saved to local disk.",
      });
    } catch (err) {
      setStatus({
        tone: "error",
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleCheckConnection(): Promise<void> {
    if (!settings) return;
    setChecking(true);
    setStatus(null);
    try {
      const res = await fetch("/api/settings/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ai: settings.ai }),
      });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res));
      }
      const result = (await res.json()) as AiConnectionCheckResult;
      setStatus({
        tone: result.ok ? "success" : "error",
        text: result.ok ? result.message : `Error: ${result.message}`,
      });
    } catch (err) {
      setStatus({
        tone: "error",
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setChecking(false);
    }
  }

  async function handleRefreshModels(): Promise<void> {
    if (!settings) return;
    setRefreshingModels(true);
    setStatus(null);
    try {
      const res = await fetch("/api/settings/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ai: settings.ai }),
      });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res));
      }
      const result = (await res.json()) as AiModelListResult;
      const nextModels =
        result.source === "live"
          ? result.models
          : getCuratedModels(settings.ai.aiProvider);
      setLiveModels(result.source === "live" ? result.models : null);

      const trimmedId = settings.ai.modelId.trim();
      setIsCustomModel(
        Boolean(trimmedId) && !nextModels.some((m) => m.id === trimmedId),
      );

      setStatus({
        tone: result.source === "live" ? "success" : "error",
        text:
          result.message ??
          (result.source === "live"
            ? `Loaded ${result.models.length} live models.`
            : "Showing curated presets."),
      });
    } catch (err) {
      setLiveModels(null);
      setIsCustomModel(
        isCustomModelId(settings.ai.aiProvider, settings.ai.modelId),
      );
      setStatus({
        tone: "error",
        text: `Error: ${err instanceof Error ? err.message : String(err)} Showing curated presets.`,
      });
    } finally {
      setRefreshingModels(false);
    }
  }

  const activeProvider = settings
    ? (AI_PROVIDER_MAP.get(settings.ai.aiProvider) ?? AI_PROVIDERS[0]!)
    : AI_PROVIDERS[0]!;
  const curatedModels = getCuratedModels(activeProvider.value);
  const availableModels = liveModels ?? curatedModels;

  return {
    formRef,
    settings,
    loadError,
    saving,
    checking,
    refreshingModels,
    showApiKey,
    setShowApiKey,
    isCustomModel,
    availableModels,
    status,
    invalidFields,
    activeProvider,
    syncFieldValidity,
    updateProfileField,
    updateProvider,
    selectModelOption,
    updateAiField,
    handleSave,
    handleCheckConnection,
    handleRefreshModels,
  };
}
