export type AiProviderType =
  | "openai-compatible"
  | "gemini"
  | "openrouter"
  | "anthropic"
  | "ollama";

export interface TeacherProfileSettings {
  studentTeacherName: string;
  cooperatingTeacherName: string;
  tleCoordinatorName: string;
  academicHeadName: string;
  aiDeclaration: string;
}

export interface AiProviderSettings {
  aiProvider: AiProviderType;
  apiKey: string;
  baseUrl: string;
  modelId: string;
}

export interface GuroMateSettings {
  profile: TeacherProfileSettings;
  ai: AiProviderSettings;
}

export interface AiGenerateRequest {
  prompt: string;
  settings: AiProviderSettings;
}

export interface AiGenerateResult {
  text: string;
  model?: string;
}

export interface AiProviderAdapter {
  generateText(request: AiGenerateRequest): Promise<AiGenerateResult>;
}

export interface AiConnectionCheckResult {
  ok: boolean;
  message: string;
  model?: string;
}

export interface GuroMateEngineOptions {
  dataDir: string;
  templatesDir: string;
  aiAdapter?: AiProviderAdapter;
}

export interface SettingsPatch {
  profile?: Partial<TeacherProfileSettings>;
  ai?: Partial<AiProviderSettings>;
}

export interface GuroMateEngine {
  readonly dataDir: string;
  readonly templatesDir: string;
  getSettings(): Promise<GuroMateSettings>;
  saveSettings(patch: SettingsPatch): Promise<GuroMateSettings>;
  testAiConnection(
    aiOverride?: Partial<AiProviderSettings>,
  ): Promise<AiConnectionCheckResult>;
}
