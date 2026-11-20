import { useId } from "react";
import { AI_PROVIDERS } from "../engine/providers";
import type { GuroMateSettings } from "../engine/types";
import {
  SIGNATORY_FIELDS,
  useSettingsWorkspace,
} from "../hooks/useSettingsWorkspace";

interface SettingsWorkspaceProps {
  onSettingsSaved?: (settings: GuroMateSettings) => void;
}

export function SettingsWorkspace({ onSettingsSaved }: SettingsWorkspaceProps) {
  const headingId = useId();
  const baseId = useId();

  const {
    formRef,
    settings,
    loadError,
    saving,
    checking,
    showApiKey,
    setShowApiKey,
    status,
    invalidFields,
    activeProvider,
    syncFieldValidity,
    updateProfileField,
    updateProvider,
    updateAiField,
    handleSave,
    handleCheckConnection,
  } = useSettingsWorkspace(onSettingsSaved);

  if (loadError) {
    return (
      <div
        role="alert"
        className="rounded-md border border-error bg-error-container p-gutter-md text-on-error-container font-body text-body-md"
      >
        Error: Unable to load settings ({loadError}).
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="rounded-md border border-outline-variant bg-surface-container-lowest p-gutter-lg text-on-surface-variant font-body text-body-md">
        Loading settings...
      </div>
    );
  }

  const inputClass = (name: string, mono = false) =>
    `w-full px-gutter-md py-gutter-sm rounded bg-surface-container-lowest border text-on-surface focus-visible:outline-2 focus-visible:outline-primary ${
      mono ? "font-mono text-mono-md" : "font-body text-body-md"
    } ${
      invalidFields[name]
        ? "border-error bg-error-container/20"
        : "border-outline-variant focus:border-primary"
    }`;

  const describedBy = (hintId: string | null, errId: string, name: string) => {
    const ids = [hintId, invalidFields[name] ? errId : null].filter(Boolean);
    return ids.length ? ids.join(" ") : undefined;
  };

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-gutter-lg max-w-[1120px] mx-auto"
    >
      {/* Page Title & Action Row */}
      <div className="flex flex-wrap items-end justify-between gap-gutter-md">
        <div className="flex flex-col gap-gutter-xs">
          <h1
            id={headingId}
            tabIndex={-1}
            className="font-headline text-headline-lg text-on-surface text-balance"
          >
            Teacher Profile &amp; Personal AI Settings
          </h1>
          <p className="font-body text-body-md text-on-surface-variant">
            Saved locally to{" "}
            <span className="font-mono text-mono-md">./data/settings.json</span>{" "}
            — survives browser restarts and cache clears.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-gutter-sm">
          <button
            type="button"
            disabled={checking}
            onClick={() => void handleCheckConnection()}
            className="inline-flex items-center justify-center gap-gutter-sm px-gutter-md py-gutter-sm rounded bg-surface-container-lowest text-on-surface border border-outline-variant font-label text-label-lg hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change disabled:opacity-60"
          >
            <span
              className="material-symbols-outlined text-title-md text-primary"
              aria-hidden="true"
            >
              network_check
            </span>
            <span>{checking ? "Checking..." : "Test AI Connection"}</span>
          </button>

          <button
            type="submit"
            form={`${baseId}-form`}
            disabled={saving}
            className="inline-flex items-center justify-center gap-gutter-sm px-gutter-md py-gutter-sm rounded bg-primary text-on-primary font-label text-label-lg hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors duration-state-change disabled:opacity-60"
          >
            <span
              className="material-symbols-outlined text-title-md"
              aria-hidden="true"
            >
              save
            </span>
            <span>{saving ? "Saving..." : "Save Settings"}</span>
          </button>
        </div>
      </div>

      {/* Status Banner */}
      <div
        role="status"
        aria-live="polite"
        hidden={!status}
        className={`rounded-md border p-gutter-md flex items-center gap-gutter-sm font-body text-body-md ${
          status?.tone === "error"
            ? "border-error bg-error-container text-on-error-container"
            : "border-success bg-success-container/60 text-on-success-container"
        }`}
      >
        <span
          className="material-symbols-outlined text-title-lg shrink-0"
          aria-hidden="true"
        >
          {status?.tone === "error" ? "error" : "check_circle"}
        </span>
        <span>{status?.text ?? ""}</span>
      </div>

      <form
        id={`${baseId}-form`}
        ref={formRef}
        aria-labelledby={headingId}
        onSubmit={(e) => void handleSave(e)}
        noValidate
        className="flex flex-col gap-gutter-lg"
      >
        {/* Section 1: Teacher Profile & ILAW Signatories */}
        <fieldset className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-lg flex flex-col gap-gutter-md">
          <div className="flex flex-wrap items-center justify-between gap-gutter-sm pb-gutter-sm border-b border-outline-variant">
            <div className="flex flex-col gap-gutter-xs">
              <legend className="font-title text-title-lg text-on-surface">
                Teacher Profile &amp; ILAW Signatories
              </legend>
              <p className="font-body text-body-sm text-on-surface-variant">
                Automatically populates the header and bottom signatory tables
                in every exported DLL and DLP .docx.
              </p>
            </div>
            <span className="px-gutter-sm py-gutter-xs rounded-full bg-surface-variant text-on-surface-variant font-label text-label-sm">
              DO 3 s. 2026 Compliant
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter-md">
            {SIGNATORY_FIELDS.map((field) => {
              const inputId = `${baseId}-${field.key}`;
              const errId = `${inputId}-err`;
              const isInvalid = Boolean(invalidFields[field.key]);
              return (
                <div key={field.key} className="flex flex-col gap-gutter-xs">
                  <label
                    htmlFor={inputId}
                    className="font-label text-label-md text-on-surface"
                  >
                    {field.label} <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id={inputId}
                    name={field.key}
                    type="text"
                    autoComplete={field.autoComplete}
                    required
                    value={settings.profile[field.key]}
                    className={inputClass(field.key)}
                    aria-invalid={isInvalid ? "true" : "false"}
                    aria-describedby={describedBy(null, errId, field.key)}
                    onChange={(e) => {
                      updateProfileField(field.key, e.target.value);
                      if (invalidFields[field.key]) {
                        syncFieldValidity(e.currentTarget);
                      }
                    }}
                    onBlur={(e) => syncFieldValidity(e.currentTarget)}
                  />
                  {isInvalid && (
                    <div
                      id={errId}
                      className="font-body text-body-sm text-error"
                    >
                      {field.errorText}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-gutter-xs pt-gutter-xs">
            <label
              htmlFor={`${baseId}-aiDeclaration`}
              className="font-label text-label-md text-on-surface"
            >
              DO 3 s. 2026 Annex A — Declaration of AI Use{" "}
              <span aria-hidden="true">*</span>
            </label>
            <span
              id={`${baseId}-aiDeclaration-hint`}
              className="font-body text-body-sm text-on-surface-variant"
            >
              Included in exported DLL and DLP headers.
            </span>
            <textarea
              id={`${baseId}-aiDeclaration`}
              name="aiDeclaration"
              rows={2}
              required
              value={settings.profile.aiDeclaration}
              className={inputClass("aiDeclaration")}
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
            {invalidFields.aiDeclaration && (
              <div
                id={`${baseId}-aiDeclaration-err`}
                className="font-body text-body-sm text-error"
              >
                Error: Enter a Declaration of AI Use statement.
              </div>
            )}
          </div>
        </fieldset>

        {/* Section 2: Personal AI Provider Configuration */}
        <fieldset className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-lg flex flex-col gap-gutter-md">
          <div className="flex flex-wrap items-center justify-between gap-gutter-sm pb-gutter-sm border-b border-outline-variant">
            <div className="flex flex-col gap-gutter-xs">
              <legend className="font-title text-title-lg text-on-surface">
                Personal AI Provider (Local Proxy)
              </legend>
              <p className="font-body text-body-sm text-on-surface-variant">
                Requests are proxied through the local Vite middleware so your
                API key stays on your laptop.
              </p>
            </div>
            <span className="inline-flex items-center gap-gutter-xs px-gutter-sm py-gutter-xs rounded-full bg-surface-variant text-on-surface-variant font-label text-label-sm">
              {activeProvider.label}
            </span>
          </div>

          <fieldset className="flex flex-col gap-gutter-sm">
            <legend className="font-label text-label-md text-on-surface mb-1">
              Provider Type
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter-sm">
              {AI_PROVIDERS.map((option) => {
                const selected = settings.ai.aiProvider === option.value;
                return (
                  <label
                    key={option.value}
                    className={`flex items-center gap-gutter-sm p-gutter-sm rounded border cursor-pointer transition-colors duration-state-change ${
                      selected
                        ? "bg-surface-container-low border-primary text-primary"
                        : "bg-surface-container-lowest border-outline-variant text-on-surface hover:bg-surface-container-low"
                    }`}
                  >
                    <input
                      type="radio"
                      name="aiProvider"
                      value={option.value}
                      checked={selected}
                      onChange={() => updateProvider(option.value)}
                      className="accent-primary"
                    />
                    <span className="font-label text-label-md">
                      {option.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter-md">
            <div className="flex flex-col gap-gutter-xs">
              <label
                htmlFor={`${baseId}-modelId`}
                className="font-label text-label-md text-on-surface"
              >
                Model ID <span aria-hidden="true">*</span>
              </label>
              <span
                id={`${baseId}-modelId-hint`}
                className="font-body text-body-sm text-on-surface-variant"
              >
                Example:{" "}
                <code className="font-mono text-mono-md">
                  {activeProvider.modelExample}
                </code>
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
                className={inputClass("modelId", true)}
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
              {invalidFields.modelId && (
                <div
                  id={`${baseId}-modelId-err`}
                  className="font-body text-body-sm text-error"
                >
                  Error: Enter a model ID.
                </div>
              )}
            </div>

            <div className="flex flex-col gap-gutter-xs">
              <label
                htmlFor={`${baseId}-baseUrl`}
                className="font-label text-label-md text-on-surface"
              >
                Base URL <span aria-hidden="true">*</span>
              </label>
              <span
                id={`${baseId}-baseUrl-hint`}
                className="font-body text-body-sm text-on-surface-variant"
              >
                Default:{" "}
                <code className="font-mono text-mono-md">
                  {activeProvider.defaultBaseUrl}
                </code>
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
                className={inputClass("baseUrl", true)}
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
              {invalidFields.baseUrl && (
                <div
                  id={`${baseId}-baseUrl-err`}
                  className="font-body text-body-sm text-error"
                >
                  Error: Enter a valid http or https base URL.
                </div>
              )}
            </div>

            <div className="flex flex-col gap-gutter-xs md:col-span-2">
              <label
                htmlFor={`${baseId}-apiKey`}
                className="font-label text-label-md text-on-surface"
              >
                API Key{" "}
                {activeProvider.requiresKey ? (
                  <span aria-hidden="true">*</span>
                ) : (
                  <span className="text-on-surface-variant font-body">
                    (Optional for local Ollama)
                  </span>
                )}
              </label>
              <span
                id={`${baseId}-apiKey-hint`}
                className="font-body text-body-sm text-on-surface-variant"
              >
                Stored locally in ./data/settings.json and used only by the
                local engine proxy.
              </span>
              <div className="flex gap-gutter-sm">
                <input
                  id={`${baseId}-apiKey`}
                  name="apiKey"
                  type={showApiKey ? "text" : "password"}
                  required={activeProvider.requiresKey}
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={settings.ai.apiKey}
                  className={`${inputClass("apiKey", true)} flex-1`}
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
                  aria-pressed={showApiKey}
                  aria-label={showApiKey ? "Hide API key" : "Show API key"}
                  aria-describedby={`${baseId}-apiKey-toggle-warn`}
                  onClick={() => setShowApiKey((v) => !v)}
                  className="shrink-0 inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-sm rounded bg-surface-container-low border border-outline-variant font-label text-label-md text-on-surface hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change"
                >
                  <span
                    className="material-symbols-outlined text-title-md"
                    aria-hidden="true"
                  >
                    {showApiKey ? "visibility_off" : "visibility"}
                  </span>
                  <span>{showApiKey ? "Hide" : "Show"}</span>
                </button>
                <span
                  id={`${baseId}-apiKey-toggle-warn`}
                  className="visually-hidden"
                >
                  Warning: this displays your API key on screen.
                </span>
              </div>
              {invalidFields.apiKey && (
                <div
                  id={`${baseId}-apiKey-err`}
                  className="font-body text-body-sm text-error"
                >
                  Error: Enter an API key for {activeProvider.label}.
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-gutter-md pt-gutter-sm border-t border-outline-variant">
            <p className="font-body text-body-sm text-on-surface-variant">
              Tip: For offline campus use, select Ollama or OpenAI-Compatible
              with{" "}
              <span className="font-mono text-mono-md">
                http://localhost:11434/v1
              </span>
              .
            </p>
            <button
              type="button"
              disabled={checking}
              onClick={() => void handleCheckConnection()}
              className="shrink-0 whitespace-nowrap inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-sm rounded bg-surface-container-low border border-outline-variant text-label-lg font-label text-on-surface hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change disabled:opacity-60"
            >
              <span
                className="material-symbols-outlined text-title-md text-primary"
                aria-hidden="true"
              >
                network_check
              </span>
              <span>
                {checking ? "Checking..." : "Check AI Connection"}
              </span>
            </button>
          </div>
        </fieldset>

        {/* Section 3: Local Disk Persistence & Templates */}
        <section className="bg-surface-container-low border border-outline-variant rounded-md p-gutter-lg flex flex-col gap-gutter-md">
          <div className="flex flex-wrap items-center justify-between gap-gutter-sm">
            <h2 className="font-title text-title-md text-on-surface">
              Local Engine Storage &amp; Official ILAW Templates
            </h2>
            <span className="font-mono text-mono-md text-on-surface-variant">
              ./data/
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter-md">
            <div className="p-gutter-md rounded bg-surface-container-lowest border border-outline-variant flex items-center justify-between gap-gutter-sm">
              <div className="flex flex-col min-w-0">
                <span className="font-mono text-mono-md text-on-surface truncate">
                  DLL_ILAW_template.docx
                </span>
                <span className="font-body text-body-sm text-on-surface-variant">
                  5-Session XML Target
                </span>
              </div>
              <span
                className="material-symbols-outlined text-title-lg text-success shrink-0"
                aria-hidden="true"
              >
                verified
              </span>
            </div>

            <div className="p-gutter-md rounded bg-surface-container-lowest border border-outline-variant flex items-center justify-between gap-gutter-sm">
              <div className="flex flex-col min-w-0">
                <span className="font-mono text-mono-md text-on-surface truncate">
                  DLP_ILAW_template.docx
                </span>
                <span className="font-body text-body-sm text-on-surface-variant">
                  2-Column XML Target
                </span>
              </div>
              <span
                className="material-symbols-outlined text-title-lg text-success shrink-0"
                aria-hidden="true"
              >
                verified
              </span>
            </div>

            <div className="p-gutter-md rounded bg-surface-container-lowest border border-outline-variant flex items-center justify-between gap-gutter-sm">
              <div className="flex flex-col min-w-0">
                <span className="font-mono text-mono-md text-on-surface truncate">
                  Local JSON Stores
                </span>
                <span className="font-body text-body-sm text-on-surface-variant">
                  settings, dlls, dlps, quizzes...
                </span>
              </div>
              <span
                className="material-symbols-outlined text-title-lg text-success shrink-0"
                aria-hidden="true"
              >
                folder_check
              </span>
            </div>
          </div>
        </section>
      </form>
    </section>
  );
}
