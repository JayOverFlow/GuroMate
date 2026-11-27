import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { computeCatalogCoverage } from "../engine/catalogCoverage";
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
  CurriculumCompetency,
  GuroMateSettings,
} from "../engine/types";
import {
  SETTINGS_SCOPE_FIELDS,
  isNonEmptyText,
  updateFieldError,
  validateSettingsField,
  validateSettingsForm,
  type FieldErrors,
  type SettingsFieldKey,
  type SettingsValidationScope,
} from "../utils/formValidation";

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
  autoComplete?: string;
}

export const SIGNATORY_FIELDS: readonly SignatoryFieldConfig[] = [
  {
    key: "studentTeacherName",
    label: "Pre-Service Teacher (Prepared by)",
    autoComplete: "name",
  },
  {
    key: "cooperatingTeacherName",
    label: "Cooperating Teacher (Checked by)",
  },
  {
    key: "tleCoordinatorName",
    label: "TLE Coordinator",
  },
  {
    key: "academicHeadName",
    label: "Academic Head Coordinator",
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
  const interactedFieldsRef = useRef<Set<SettingsFieldKey>>(new Set());
  const [settings, setSettings] = useState<GuroMateSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [liveModels, setLiveModels] = useState<AiModelOption[] | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [status, setStatus] = useState<SettingsStatusState | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<SettingsFieldKey>>(
    {},
  );
  const [catalogItems, setCatalogItems] = useState<
    CurriculumCompetency[] | null
  >(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

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

    void fetch("/api/curriculum")
      .then(async (res) => {
        if (!res.ok) throw new Error(await readErrorMessage(res));
        return (await res.json()) as CurriculumCompetency[];
      })
      .then((items) => {
        if (active) setCatalogItems(items);
      })
      .catch((err) => {
        if (active) {
          setCatalogError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      active = false;
    };
  }, []);

  function setSingleFieldError(
    field: SettingsFieldKey,
    nextError: string | undefined,
  ): void {
    setFieldErrors((prev) => updateFieldError(prev, field, nextError));
  }

  function validateField(field: SettingsFieldKey): void {
    if (!settings) return;
    if (!interactedFieldsRef.current.has(field) && !fieldErrors[field]) return;
    setSingleFieldError(
      field,
      validateSettingsField(field, settings, { isCustomModel }),
    );
  }

  function focusField(field: SettingsFieldKey): void {
    const control = formRef.current?.elements.namedItem(field);
    if (control instanceof HTMLElement) {
      control.focus();
    }
  }

  function validateScope(scope: SettingsValidationScope): boolean {
    if (!settings) return false;
    const scopeFields = SETTINGS_SCOPE_FIELDS[scope];
    for (const field of scopeFields) {
      interactedFieldsRef.current.add(field);
    }
    const scopeErrors = validateSettingsForm(settings, scope, {
      isCustomModel,
    });

    setFieldErrors((prev) => {
      const next: FieldErrors<SettingsFieldKey> = { ...prev };
      for (const field of scopeFields) {
        const message = scopeErrors[field];
        if (message) {
          next[field] = message;
        } else {
          delete next[field];
        }
      }
      return next;
    });

    const firstInvalidField = scopeFields.find((field) =>
      Boolean(scopeErrors[field]),
    );
    if (firstInvalidField) {
      focusField(firstInvalidField);
      return false;
    }
    return true;
  }

  function updateProfileField(
    key: keyof GuroMateSettings["profile"],
    value: string,
  ): void {
    if (!settings) return;
    interactedFieldsRef.current.add(key);
    const nextSettings: GuroMateSettings = {
      ...settings,
      profile: { ...settings.profile, [key]: value },
    };
    setSettings(nextSettings);
    if (fieldErrors[key]) {
      setSingleFieldError(
        key,
        validateSettingsField(key, nextSettings, { isCustomModel }),
      );
    }
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
    interactedFieldsRef.current.delete("apiKey");
    interactedFieldsRef.current.delete("modelId");
    if (shouldSwapUrl) interactedFieldsRef.current.delete("baseUrl");
    setFieldErrors((prev) => {
      const next: FieldErrors<SettingsFieldKey> = { ...prev };
      delete next.apiKey;
      delete next.modelId;
      if (shouldSwapUrl) delete next.baseUrl;
      return next;
    });
  }

  function selectModelOption(value: string): void {
    if (!settings) return;
    if (value === CUSTOM_MODEL_OPTION) {
      setIsCustomModel(true);
      const trimmed = settings.ai.modelId.trim();
      if (trimmed && availableModels.some((m) => m.id === trimmed)) {
        setSettings((prev) =>
          prev ? { ...prev, ai: { ...prev.ai, modelId: "" } } : prev,
        );
      }
      interactedFieldsRef.current.delete("modelId");
      setSingleFieldError("modelId", undefined);
      return;
    }

    interactedFieldsRef.current.add("modelId");
    setIsCustomModel(false);
    setSettings((prev) =>
      prev ? { ...prev, ai: { ...prev.ai, modelId: value } } : prev,
    );
    if (isNonEmptyText(value)) {
      setSingleFieldError("modelId", undefined);
    }
  }

  function updateAiField(
    key: "apiKey" | "baseUrl" | "modelId",
    value: string,
  ): void {
    if (!settings) return;
    interactedFieldsRef.current.add(key);
    const nextSettings: GuroMateSettings = {
      ...settings,
      ai: { ...settings.ai, [key]: value },
    };
    setSettings(nextSettings);
    if (fieldErrors[key]) {
      setSingleFieldError(
        key,
        validateSettingsField(key, nextSettings, { isCustomModel }),
      );
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!settings) return;

    if (!validateScope("save")) {
      setStatus({
        tone: "error",
        text: "Fix the highlighted fields before saving.",
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
      interactedFieldsRef.current.clear();
      setFieldErrors({});
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
    if (!validateScope("test")) {
      setStatus(null);
      return;
    }

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
    if (!validateScope("refresh")) {
      setStatus(null);
      return;
    }

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
  const catalogCoverage = useMemo(
    () => (catalogItems ? computeCatalogCoverage(catalogItems) : null),
    [catalogItems],
  );

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
    fieldErrors,
    activeProvider,
    catalogCoverage,
    catalogError,
    validateField,
    updateProfileField,
    updateProvider,
    selectModelOption,
    updateAiField,
    handleSave,
    handleCheckConnection,
    handleRefreshModels,
  };
}
