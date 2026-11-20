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

export const GRADE_LEVELS = [7, 8, 9, 10] as const;
export type GradeLevel = (typeof GRADE_LEVELS)[number];

export const QUARTERS = [1, 2, 3, 4] as const;
export type QuarterNumber = (typeof QUARTERS)[number];

export const TLE_COMPONENTS = ["ICT", "AFA", "FCS", "IA"] as const;
export type TleComponent = (typeof TLE_COMPONENTS)[number];

export const BOW_TERMS = ["First Term", "Second Term", "Third Term"] as const;
export type BowTerm = (typeof BOW_TERMS)[number];

export interface BudgetOfWorkInfo {
  term: string;
  weekRange: string;
  suggestedActivities: string;
  suggestedPerformanceTasks: string;
}

export interface CurriculumCompetency {
  id: string;
  source: "built-in" | "custom";
  gradeLevels: GradeLevel[];
  quarters: QuarterNumber[];
  quarterLabel: string;
  component: TleComponent;
  sector: string | null;
  sectorDescription: string | null;
  contentTopic: string;
  contentSubTopics: string[];
  contentStandard: string;
  performanceStandard: string;
  competencyNumber: number | null;
  learningCompetency: string;
  budgetOfWork?: BudgetOfWorkInfo;
  customNotes?: string;
}

export interface CurriculumFilter {
  gradeLevel?: GradeLevel;
  quarter?: QuarterNumber;
  term?: string;
  component?: TleComponent;
  sector?: string;
  query?: string;
}

export interface CustomCompetencyInput {
  id?: string;
  gradeLevels: GradeLevel[];
  quarters: QuarterNumber[];
  component: TleComponent;
  sector?: string | null;
  contentTopic: string;
  contentSubTopics?: string[];
  contentStandard: string;
  performanceStandard: string;
  learningCompetency: string;
  budgetOfWork?: Partial<BudgetOfWorkInfo>;
  customNotes?: string;
}

export interface GuroMateEngine {
  readonly dataDir: string;
  readonly templatesDir: string;
  getSettings(): Promise<GuroMateSettings>;
  saveSettings(patch: SettingsPatch): Promise<GuroMateSettings>;
  testAiConnection(
    aiOverride?: Partial<AiProviderSettings>,
  ): Promise<AiConnectionCheckResult>;
  listCurriculum(filter?: CurriculumFilter): Promise<CurriculumCompetency[]>;
  saveCustomCompetency(
    input: CustomCompetencyInput,
  ): Promise<CurriculumCompetency>;
  saveCompetencyNotes(
    competencyId: string,
    customNotes: string,
  ): Promise<CurriculumCompetency>;
  deleteCustomCompetency(id: string): Promise<void>;
}
