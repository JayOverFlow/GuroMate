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

export interface ClassSection {
  id: string;
  gradeLevel: GradeLevel;
  sectionName: string;
  students: string[];
}

export interface ClassSectionInput {
  id?: string;
  gradeLevel: GradeLevel;
  sectionName: string;
  students: string[];
}

export const SESSION_NUMBERS = [1, 2, 3, 4, 5] as const;
export type SessionNumber = (typeof SESSION_NUMBERS)[number];

export interface DllSessionConfig {
  sessionNumber: SessionNumber;
  mode: "instructional" | "non-instructional";
  competencyIds: string[];
  nonInstructionalReason?: string;
}

export interface DllSessionPlan {
  sessionNumber: SessionNumber;
  mode: "instructional" | "non-instructional";
  competencyIds: string[];
  components: TleComponent[];
  nonInstructionalReason?: string;
  learningObjectives: string;
  preLesson: string;
  lessonFlow: string;
  learningResources: string;
  integrationAndContextualization: string;
  formativeAssessment: string;
  extendedLearningOpportunities: string;
  reflections: string;
}

export interface DllIntentions {
  learningCompetencies: string[];
  contentStandards: string[];
  performanceStandards: string[];
  learnerContext: string;
}

export interface DailyLessonLog {
  id: string;
  createdAt: string;
  updatedAt: string;
  lessonTitle: string;
  learningAreas: string;
  gradeAndSection: string;
  references: string;
  promptNotes: string;
  intentions: DllIntentions;
  sessions: [
    DllSessionPlan,
    DllSessionPlan,
    DllSessionPlan,
    DllSessionPlan,
    DllSessionPlan,
  ];
}

export interface GenerateDllInput {
  lessonTitle?: string;
  gradeAndSection: string;
  references?: string;
  promptNotes?: string;
  sessions: DllSessionConfig[];
}

export interface DllDocxExport {
  filename: string;
  buffer: Buffer;
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
  listClassSections(): Promise<ClassSection[]>;
  saveClassSection(input: ClassSectionInput): Promise<ClassSection>;
  deleteClassSection(id: string): Promise<void>;
  listDlls(): Promise<DailyLessonLog[]>;
  getDll(id: string): Promise<DailyLessonLog>;
  generateDll(input: GenerateDllInput): Promise<DailyLessonLog>;
  saveDll(dll: DailyLessonLog): Promise<DailyLessonLog>;
  deleteDll(id: string): Promise<void>;
  renderDllMarkdown(dll: DailyLessonLog): string;
  exportDllDocx(id: string): Promise<DllDocxExport>;
}
