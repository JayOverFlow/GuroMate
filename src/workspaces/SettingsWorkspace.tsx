import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { AI_PROVIDERS, AI_PROVIDER_MAP } from "../engine/providers";
import type {
  AiConnectionCheckResult,
  AiProviderType,
  GuroMateSettings,
} from "../engine/types";

const DEFAULT_BASE_URL_SET = new Set(
  AI_PROVIDERS.map((option) => option.defaultBaseUrl),
);

interface StatusState {
  tone: "success" | "error";
  text: string;
}

interface SignatoryFieldConfig {
  key: Exclude<keyof GuroMateSettings["profile"], "aiDeclaration">;
  label: string;
  errorText: string;
  autoComplete?: string;
}

const SIGNATORY_FIELDS: readonly SignatoryFieldConfig[] = [
  {
    key: "studentTeacherName",
    label: "Pre-Service Teacher",
    errorText: "Error: Enter the pre-service teacher name.",
    autoComplete: "name",
  },
  {
    key: "cooperatingTeacherName",
    label: "Cooperating Teacher",
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

export function SettingsWorkspace() {
  const formRef = useRef<HTMLFormElement>(null);
  const headingId = useId();
  const baseId = useId();

  const [settings, setSettings] = useState<GuroMateSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [status, setStatus] = useState<StatusState | null>(null);
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
        if (active) setSettings(data);
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

  function syncFieldValidity(el: HTMLInputElement | HTMLTextAreaElement): void {
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
    if (!option) return;

    setSettings((prev) => {
      if (!prev) return prev;
      const currentUrl = prev.ai.baseUrl.trim();
      const shouldSwapUrl = !currentUrl || DEFAULT_BASE_URL_SET.has(currentUrl);
      return {
        ...prev,
        ai: {
          ...prev.ai,
          aiProvider: nextProvider,
          baseUrl: shouldSwapUrl ? option.defaultBaseUrl : prev.ai.baseUrl,
        },
      };
    });
    setInvalidFields((prev) => ({ ...prev, apiKey: false }));
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
          control instanceof HTMLTextAreaElement
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

  if (loadError) {
    return (
      <div className="status-banner" data-tone="error" role="alert">
        Error: Unable to load settings ({loadError}).
      </div>
    );
  }

  if (!settings) {
    return <p>Loading settings...</p>;
  }

  const activeProvider =
    AI_PROVIDER_MAP.get(settings.ai.aiProvider) ?? AI_PROVIDERS[0]!;

  const fieldClass = (name: string) =>
    invalidFields[name] ? "user-invalid-fallback" : undefined;

  const describedBy = (hintId: string | null, errId: string, name: string) => {
    const ids = [hintId, invalidFields[name] ? errId : null].filter(Boolean);
    return ids.length ? ids.join(" ") : undefined;
  };

  return (
    <section aria-labelledby={headingId}>
      <div className="workspace-header">
        <h1 id={headingId} tabIndex={-1}>
          Teacher Profile &amp; AI Settings
        </h1>
        <p className="workspace-subtitle">
          Saved locally to disk (<code>./data/settings.json</code>). Survives
          browser restarts and cache clears.
        </p>
      </div>

      <form
        ref={formRef}
        className="settings-form"
        aria-labelledby={headingId}
        onSubmit={(e) => void handleSave(e)}
        noValidate
      >
        <fieldset className="settings-fieldset">
          <legend>Teacher Profile &amp; Institution Signatories</legend>

          {SIGNATORY_FIELDS.map((field) => {
            const inputId = `${baseId}-${field.key}`;
            const errId = `${inputId}-err`;
            return (
              <div key={field.key} className="field">
                <label htmlFor={inputId}>
                  {field.label} <span aria-hidden="true">*</span>
                </label>
                <input
                  id={inputId}
                  name={field.key}
                  type="text"
                  autoComplete={field.autoComplete}
                  required
                  value={settings.profile[field.key]}
                  className={fieldClass(field.key)}
                  aria-invalid={invalidFields[field.key] ? "true" : "false"}
                  aria-describedby={describedBy(null, errId, field.key)}
                  onChange={(e) => {
                    updateProfileField(field.key, e.target.value);
                    if (invalidFields[field.key]) {
                      syncFieldValidity(e.currentTarget);
                    }
                  }}
                  onBlur={(e) => syncFieldValidity(e.currentTarget)}
                />
                <div id={errId} className="error-msg">
                  {field.errorText}
                </div>
              </div>
            );
          })}

          <div className="field">
            <label htmlFor={`${baseId}-aiDeclaration`}>
              Declaration of AI Use (DO 3 s. 2026 Annex A){" "}
              <span aria-hidden="true">*</span>
            </label>
            <span id={`${baseId}-aiDeclaration-hint`} className="hint">
              Included in exported DLL and DLP headers.
            </span>
            <textarea
              id={`${baseId}-aiDeclaration`}
              name="aiDeclaration"
              required
              value={settings.profile.aiDeclaration}
              className={fieldClass("aiDeclaration")}
              aria-invalid={invalidFields.aiDeclaration ? "true" : "false"}
              aria-describedby={describedBy(
                `${baseId}-aiDeclaration-hint`,
                `${baseId}-aiDeclaration-err`,
                "aiDeclaration",
              )}
              onChange={(e) => {
                updateProfileField("aiDeclaration", e.target.value);
                if (invalidFields.aiDeclaration) {
                  syncFieldValidity(e.currentTarget);
                }
              }}
              onBlur={(e) => syncFieldValidity(e.currentTarget)}
            />
            <div id={`${baseId}-aiDeclaration-err`} className="error-msg">
              Error: Enter a Declaration of AI Use statement.
            </div>
          </div>
        </fieldset>

        <fieldset className="settings-fieldset">
          <legend>Personal AI Provider Configuration</legend>

          <fieldset className="provider-fieldset">
            <legend>Provider Type</legend>
            <div className="provider-grid">
              {AI_PROVIDERS.map((option) => (
                <label key={option.value} className="provider-option">
                  <input
                    type="radio"
                    name="aiProvider"
                    value={option.value}
                    checked={settings.ai.aiProvider === option.value}
                    onChange={() => updateProvider(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="field">
            <label htmlFor={`${baseId}-apiKey`}>
              API Key{" "}
              {activeProvider.requiresKey ? (
                <span aria-hidden="true">*</span>
              ) : (
                "(Optional for local Ollama)"
              )}
            </label>
            <span id={`${baseId}-apiKey-hint`} className="hint">
              Stored locally in ./data/settings.json and used only by the local
              engine proxy.
            </span>
            <div className="input-with-toggle">
              <input
                id={`${baseId}-apiKey`}
                name="apiKey"
                type={showApiKey ? "text" : "password"}
                required={activeProvider.requiresKey}
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                value={settings.ai.apiKey}
                className={fieldClass("apiKey")}
                aria-invalid={invalidFields.apiKey ? "true" : "false"}
                aria-describedby={describedBy(
                  `${baseId}-apiKey-hint`,
                  `${baseId}-apiKey-err`,
                  "apiKey",
                )}
                onChange={(e) => {
                  updateAiField("apiKey", e.target.value);
                  if (invalidFields.apiKey) {
                    syncFieldValidity(e.currentTarget);
                  }
                }}
                onBlur={(e) => syncFieldValidity(e.currentTarget)}
              />
              <button
                type="button"
                className="btn-secondary"
                aria-pressed={showApiKey}
                aria-label={showApiKey ? "Hide API key" : "Show API key"}
                aria-describedby={`${baseId}-apiKey-toggle-warn`}
                onClick={() => setShowApiKey((v) => !v)}
              >
                {showApiKey ? "Hide" : "Show"}
              </button>
              <span
                id={`${baseId}-apiKey-toggle-warn`}
                className="visually-hidden"
              >
                Warning: this displays your API key on screen.
              </span>
            </div>
            <div id={`${baseId}-apiKey-err`} className="error-msg">
              Error: Enter an API key for {activeProvider.label}.
            </div>
          </div>

          <div className="field">
            <label htmlFor={`${baseId}-baseUrl`}>
              Base URL <span aria-hidden="true">*</span>
            </label>
            <span id={`${baseId}-baseUrl-hint`} className="hint">
              Default for {activeProvider.label}:{" "}
              <code>{activeProvider.defaultBaseUrl}</code>
            </span>
            <input
              id={`${baseId}-baseUrl`}
              name="baseUrl"
              type="url"
              required
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={settings.ai.baseUrl}
              className={fieldClass("baseUrl")}
              aria-invalid={invalidFields.baseUrl ? "true" : "false"}
              aria-describedby={describedBy(
                `${baseId}-baseUrl-hint`,
                `${baseId}-baseUrl-err`,
                "baseUrl",
              )}
              onChange={(e) => {
                updateAiField("baseUrl", e.target.value);
                if (invalidFields.baseUrl) {
                  syncFieldValidity(e.currentTarget);
                }
              }}
              onBlur={(e) => syncFieldValidity(e.currentTarget)}
            />
            <div id={`${baseId}-baseUrl-err`} className="error-msg">
              Error: Enter a valid http or https base URL.
            </div>
          </div>

          <div className="field">
            <label htmlFor={`${baseId}-modelId`}>
              Model ID <span aria-hidden="true">*</span>
            </label>
            <span id={`${baseId}-modelId-hint`} className="hint">
              Example: <code>{activeProvider.modelExample}</code>
            </span>
            <input
              id={`${baseId}-modelId`}
              name="modelId"
              type="text"
              required
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={settings.ai.modelId}
              className={fieldClass("modelId")}
              aria-invalid={invalidFields.modelId ? "true" : "false"}
              aria-describedby={describedBy(
                `${baseId}-modelId-hint`,
                `${baseId}-modelId-err`,
                "modelId",
              )}
              onChange={(e) => {
                updateAiField("modelId", e.target.value);
                if (invalidFields.modelId) {
                  syncFieldValidity(e.currentTarget);
                }
              }}
              onBlur={(e) => syncFieldValidity(e.currentTarget)}
            />
            <div id={`${baseId}-modelId-err`} className="error-msg">
              Error: Enter a model ID.
            </div>
          </div>
        </fieldset>

        <div className="actions-row">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save Settings"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={checking}
            onClick={() => void handleCheckConnection()}
          >
            {checking ? "Checking..." : "Check AI Connection"}
          </button>
        </div>

        <div
          className="status-banner"
          role="status"
          aria-live="polite"
          data-tone={status?.tone}
          hidden={!status}
        >
          {status?.text ?? ""}
        </div>
      </form>
    </section>
  );
}
