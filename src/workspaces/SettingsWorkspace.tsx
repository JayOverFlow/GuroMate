import { useId } from "react";
import { FieldError, fieldBorderClass } from "../components/FieldError";
import { DEFAULT_AI_DECLARATION_TEMPLATE } from "../engine/lessonHelpers";
import { AI_PROVIDERS, formatModelOptionLabel } from "../engine/providers";
import { TLE_COMPONENTS, type GuroMateSettings } from "../engine/types";
import { COMPONENT_SHORT_LABELS } from "../hooks/useCurriculumWorkspace";
import {
  CUSTOM_MODEL_OPTION,
  SIGNATORY_FIELDS,
  useSettingsWorkspace,
} from "../hooks/useSettingsWorkspace";
import { buildDescribedBy } from "../utils/formValidation";

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

  const inputClass = (invalid: boolean, mono = false) =>
    `w-full px-gutter-md py-gutter-sm rounded bg-surface-container-lowest border text-on-surface focus-visible:outline-2 focus-visible:outline-primary ${
      mono ? "font-mono text-mono-md" : "font-body text-body-md"
    } ${fieldBorderClass(invalid)}`;

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
              DO 003, s. 2026 Compliant
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter-md">
            {SIGNATORY_FIELDS.map((field) => {
              const inputId = `${baseId}-${field.key}`;
              const errId = `${inputId}-err`;
              const errorMessage = fieldErrors[field.key];
              const isInvalid = Boolean(errorMessage);
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
                    className={inputClass(isInvalid)}
                    aria-invalid={isInvalid ? "true" : "false"}
                    aria-describedby={buildDescribedBy(null, errId, isInvalid)}
                    onChange={(e) =>
                      updateProfileField(field.key, e.target.value)
                    }
                    onBlur={() => validateField(field.key)}
                  />
                  <FieldError id={errId} message={errorMessage} />
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-gutter-xs pt-gutter-xs">
            <div className="flex flex-wrap items-center justify-between gap-gutter-xs">
              <label
                htmlFor={`${baseId}-aiDeclaration`}
                className="font-label text-label-md text-on-surface"
              >
                DO 003, s. 2026 Annex A — Declaration of AI Use (Default
                Template) <span aria-hidden="true">*</span>
              </label>
              {settings.profile.aiDeclaration.trim() !==
                DEFAULT_AI_DECLARATION_TEMPLATE && (
                <button
                  type="button"
                  onClick={() =>
                    updateProfileField(
                      "aiDeclaration",
                      DEFAULT_AI_DECLARATION_TEMPLATE,
                    )
                  }
                  className="text-label-sm font-label text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary rounded-sm"
                >
                  Reset to DO 003 Default
                </button>
              )}
            </div>
            <span
              id={`${baseId}-aiDeclaration-hint`}
              className="font-body text-body-sm text-on-surface-variant"
            >
              Use{" "}
              <code className="font-mono text-mono-md">{"{aiTool}"}</code> to
              auto-insert the active AI provider and model on new DLLs and DLPs;
              also used as fallback for older saved DLLs and DLPs on{" "}
              <code className="font-mono text-mono-md">.docx</code> export.
            </span>
            <textarea
              id={`${baseId}-aiDeclaration`}
              name="aiDeclaration"
              rows={3}
              required
              value={settings.profile.aiDeclaration}
              className={inputClass(Boolean(fieldErrors.aiDeclaration))}
              aria-invalid={fieldErrors.aiDeclaration ? "true" : "false"}
              aria-describedby={buildDescribedBy(
                `${baseId}-aiDeclaration-hint`,
                `${baseId}-aiDeclaration-err`,
                Boolean(fieldErrors.aiDeclaration),
              )}
              onChange={(e) =>
                updateProfileField("aiDeclaration", e.target.value)
              }
              onBlur={() => validateField("aiDeclaration")}
            />
            <FieldError
              id={`${baseId}-aiDeclaration-err`}
              message={fieldErrors.aiDeclaration}
            />
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
                {isCustomModel ? (
                  <>
                    Example:{" "}
                    <code className="font-mono text-mono-md">
                      {activeProvider.modelExample}
                    </code>
                  </>
                ) : settings.ai.modelId ? (
                  <>
                    Selected:{" "}
                    <code className="font-mono text-mono-md">
                      {settings.ai.modelId}
                    </code>
                  </>
                ) : (
                  `Choose a model for ${activeProvider.label} or enter a custom ID.`
                )}
              </span>
              <div className="flex gap-gutter-sm">
                <select
                  id={`${baseId}-modelId`}
                  name={isCustomModel ? "modelPreset" : "modelId"}
                  required={!isCustomModel}
                  value={
                    isCustomModel ? CUSTOM_MODEL_OPTION : settings.ai.modelId
                  }
                  className={`${inputClass(!isCustomModel && Boolean(fieldErrors.modelId))} flex-1 min-w-0`}
                  aria-invalid={
                    !isCustomModel && fieldErrors.modelId ? "true" : "false"
                  }
                  aria-describedby={
                    isCustomModel
                      ? `${baseId}-modelId-hint`
                      : buildDescribedBy(
                          `${baseId}-modelId-hint`,
                          `${baseId}-modelId-err`,
                          Boolean(fieldErrors.modelId),
                        )
                  }
                  onChange={(e) => selectModelOption(e.target.value)}
                  onBlur={() => {
                    if (!isCustomModel) validateField("modelId");
                  }}
                >
                  <option value="" disabled>
                    Select a model...
                  </option>
                  {availableModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {formatModelOptionLabel(model)}
                    </option>
                  ))}
                  <option value={CUSTOM_MODEL_OPTION}>Custom model ID...</option>
                </select>
                <button
                  type="button"
                  disabled={refreshingModels}
                  onClick={() => void handleRefreshModels()}
                  className="shrink-0 whitespace-nowrap inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-sm rounded bg-surface-container-low border border-outline-variant font-label text-label-md text-on-surface hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-primary transition-colors duration-state-change disabled:opacity-60"
                >
                  <span
                    className="material-symbols-outlined text-title-md"
                    aria-hidden="true"
                  >
                    refresh
                  </span>
                  <span>
                    {refreshingModels ? "Refreshing..." : "Refresh Models"}
                  </span>
                </button>
              </div>
              {isCustomModel && (
                <input
                  id={`${baseId}-customModelId`}
                  name="modelId"
                  type="text"
                  required
                  placeholder={activeProvider.modelExample}
                  aria-label="Custom Model ID"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={settings.ai.modelId}
                  className={inputClass(Boolean(fieldErrors.modelId), true)}
                  aria-invalid={fieldErrors.modelId ? "true" : "false"}
                  aria-describedby={buildDescribedBy(
                    `${baseId}-modelId-hint`,
                    `${baseId}-modelId-err`,
                    Boolean(fieldErrors.modelId),
                  )}
                  onChange={(e) => updateAiField("modelId", e.target.value)}
                  onBlur={() => validateField("modelId")}
                />
              )}
              <FieldError
                id={`${baseId}-modelId-err`}
                message={fieldErrors.modelId}
              />
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
                className={inputClass(Boolean(fieldErrors.baseUrl), true)}
                aria-invalid={fieldErrors.baseUrl ? "true" : "false"}
                aria-describedby={buildDescribedBy(
                  `${baseId}-baseUrl-hint`,
                  `${baseId}-baseUrl-err`,
                  Boolean(fieldErrors.baseUrl),
                )}
                onChange={(e) => updateAiField("baseUrl", e.target.value)}
                onBlur={() => validateField("baseUrl")}
              />
              <FieldError
                id={`${baseId}-baseUrl-err`}
                message={fieldErrors.baseUrl}
              />
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
                  className={`${inputClass(Boolean(fieldErrors.apiKey), true)} flex-1`}
                  aria-invalid={fieldErrors.apiKey ? "true" : "false"}
                  aria-describedby={buildDescribedBy(
                    `${baseId}-apiKey-hint`,
                    `${baseId}-apiKey-err`,
                    Boolean(fieldErrors.apiKey),
                  )}
                  onChange={(e) => updateAiField("apiKey", e.target.value)}
                  onBlur={() => validateField("apiKey")}
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
              <FieldError
                id={`${baseId}-apiKey-err`}
                message={fieldErrors.apiKey}
              />
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

      {/* Section 4: Read-Only Curriculum & BoW Catalog Coverage */}
      <section
        aria-labelledby={`${baseId}-coverage-heading`}
        className="bg-surface-container-lowest border border-outline-variant rounded-md p-gutter-lg flex flex-col gap-gutter-md"
      >
        <div className="flex flex-wrap items-center justify-between gap-gutter-sm pb-gutter-sm border-b border-outline-variant">
          <div className="flex flex-col gap-gutter-xs">
            <h2
              id={`${baseId}-coverage-heading`}
              className="font-title text-title-lg text-on-surface"
            >
              Curriculum &amp; BoW Catalog Coverage (Grades 7–12)
            </h2>
            <p className="font-body text-body-sm text-on-surface-variant">
              Read-only summary of loaded Learning Competencies and Budget of
              Work enrichment across Junior High TLE, Grade 11 SHS Core, and
              Grade 12 Technical-Professional electives.
            </p>
          </div>
          {catalogCoverage && (
            <div className="flex flex-wrap items-center gap-gutter-xs">
              <span className="px-gutter-sm py-gutter-xs rounded-full bg-surface-container font-mono text-label-sm text-on-surface tabular-nums">
                {catalogCoverage.totalCompetencies} Total
              </span>
              <span className="px-gutter-sm py-gutter-xs rounded-full bg-success-container text-on-success-container font-mono text-label-sm tabular-nums">
                {catalogCoverage.totalBowCompetencies} With BoW
              </span>
            </div>
          )}
        </div>

        {catalogError ? (
          <p className="font-body text-body-sm text-error">
            Unable to load catalog coverage ({catalogError}).
          </p>
        ) : !catalogCoverage ? (
          <p className="font-body text-body-sm text-on-surface-variant">
            Loading catalog coverage...
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-outline-variant text-on-surface-variant font-label text-label-sm">
                  <th scope="col" className="py-gutter-sm pr-gutter-md">
                    Grade Level
                  </th>
                  <th
                    scope="col"
                    className="py-gutter-sm px-gutter-sm text-right"
                  >
                    Total
                  </th>
                  <th
                    scope="col"
                    className="py-gutter-sm px-gutter-sm text-right"
                  >
                    With BoW
                  </th>
                  {TLE_COMPONENTS.map((comp) => (
                    <th
                      key={comp}
                      scope="col"
                      className="py-gutter-sm px-gutter-sm text-right"
                    >
                      {COMPONENT_SHORT_LABELS[comp]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/60 font-mono text-body-sm tabular-nums">
                {catalogCoverage.byGrade.map((row) => (
                  <tr key={row.gradeLevel}>
                    <th
                      scope="row"
                      className="py-gutter-sm pr-gutter-md font-label text-label-md text-on-surface"
                    >
                      Grade {row.gradeLevel}
                    </th>
                    <td className="py-gutter-sm px-gutter-sm text-right text-on-surface font-semibold">
                      {row.total}
                    </td>
                    <td className="py-gutter-sm px-gutter-sm text-right text-primary font-semibold">
                      {row.bowCount}
                    </td>
                    {TLE_COMPONENTS.map((comp) => (
                      <td
                        key={comp}
                        className="py-gutter-sm px-gutter-sm text-right text-on-surface-variant"
                      >
                        {row.byComponent[comp]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-outline-variant font-mono text-body-sm tabular-nums bg-surface-container-low">
                  <th
                    scope="row"
                    className="py-gutter-sm pr-gutter-md pl-gutter-xs font-label text-label-md text-on-surface"
                  >
                    Unique Total (BoW)
                  </th>
                  <td className="py-gutter-sm px-gutter-sm text-right font-semibold text-on-surface">
                    {catalogCoverage.totalCompetencies}
                  </td>
                  <td className="py-gutter-sm px-gutter-sm text-right font-semibold text-primary">
                    {catalogCoverage.totalBowCompetencies}
                  </td>
                  {catalogCoverage.byComponent.map((compRow) => (
                    <td
                      key={compRow.component}
                      className="py-gutter-sm px-gutter-sm text-right text-on-surface"
                    >
                      {compRow.total}{" "}
                      <span className="text-on-surface-variant">
                        ({compRow.bowCount})
                      </span>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
