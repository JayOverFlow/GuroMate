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

export interface AiModelOption {
  id: string;
  label: string;
  isFree?: boolean;
  freeBadge?: string;
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
  systemInstruction?: string;
  settings: AiProviderSettings;
}

export interface AiGenerateResult {
  text: string;
  model?: string;
}

export interface AiModelListResult {
  models: AiModelOption[];
  source: "live" | "curated";
  message?: string;
}

export interface AiProviderAdapter {
  generateText(request: AiGenerateRequest): Promise<AiGenerateResult>;
  listModels?(settings: AiProviderSettings): Promise<AiModelOption[]>;
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

export const GRADE_LEVELS = [7, 8, 9, 10, 11, 12] as const;
export type GradeLevel = (typeof GRADE_LEVELS)[number];

export const QUARTERS = [1, 2, 3, 4] as const;
export type QuarterNumber = (typeof QUARTERS)[number];

export const TLE_COMPONENTS = ["ICT", "AFA", "FCS", "IA", "SHS_CORE"] as const;
export type TleComponent = (typeof TLE_COMPONENTS)[number];

export const BOW_TERMS = [
  "First Term",
  "Second Term",
  "Third Term",
  "One-Term",
] as const;
export type BowTerm = (typeof BOW_TERMS)[number];

export interface BudgetOfWorkInfo {
  term: string;
  weekRange: string;
  suggestedActivities: string;
  suggestedPerformanceTasks: string;
  sourceDocument?: string;
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
  hasBow?: boolean;
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

export const PERIOD_LENGTH_PRESETS = [45, 60, 90, 120] as const;
export const MIN_PERIOD_MINUTES = 10;
export const MAX_PERIOD_MINUTES = 360;

export const CLASSROOM_FACILITIES = [
  "standard-classroom",
  "computer-lab",
  "shop-workshop",
  "kitchen-home-economics",
  "agri-farm-site",
  "limited-resources",
] as const;
export type ClassroomFacility = (typeof CLASSROOM_FACILITIES)[number];

export const DELIVERY_MODALITIES = [
  "face-to-face",
  "blended",
  "modular-offline",
] as const;
export type DeliveryModality = (typeof DELIVERY_MODALITIES)[number];

export interface ClassroomContext {
  periodMinutes: number;
  facility: ClassroomFacility;
  modality: DeliveryModality;
}

export interface ReferenceMaterial {
  sourceLabel?: string;
  text: string;
}

export interface ReferenceMaterialExtractInput {
  filename: string;
  dataBase64: string;
}

export interface ReferenceMaterialExtractResult {
  sourceLabel: string;
  text: string;
  truncated: boolean;
  originalLength: number;
  maxLength: number;
}

export const FORMATIVE_ASSESSMENT_TYPES = [
  "exit-ticket",
  "checklist",
  "demo-rubric",
  "worksheet",
  "short-quiz",
] as const;
export type FormativeAssessmentType =
  (typeof FORMATIVE_ASSESSMENT_TYPES)[number];

export interface BlueprintActivityOption {
  id: string;
  title: string;
  summary: string;
  source?: "bow" | "authentic";
  recommended: boolean;
}

export interface BlueprintAssessmentOption {
  type: FormativeAssessmentType;
  label: string;
  preview: string;
  recommended: boolean;
}

export interface DllSessionConfig {
  sessionNumber: SessionNumber;
  mode: "instructional" | "non-instructional";
  competencyIds: string[];
  nonInstructionalReason?: string;
}

export interface DllSessionBlueprint {
  sessionNumber: SessionNumber;
  mode: "instructional" | "non-instructional";
  competencyIds: string[];
  components: TleComponent[];
  nonInstructionalReason?: string;
  progressionFocus: string;
  learningObjectives: string;
  activityOptions: BlueprintActivityOption[];
  selectedActivityId: string;
  assessmentOptions: BlueprintAssessmentOption[];
  selectedAssessmentType?: FormativeAssessmentType;
}

export interface DllLessonBlueprint {
  lessonTitle: string;
  references: string;
  sessions: [
    DllSessionBlueprint,
    DllSessionBlueprint,
    DllSessionBlueprint,
    DllSessionBlueprint,
    DllSessionBlueprint,
  ];
}

export interface DllSessionPlan {
  sessionNumber: SessionNumber;
  mode: "instructional" | "non-instructional";
  competencyIds: string[];
  components: TleComponent[];
  nonInstructionalReason?: string;
  progressionFocus?: string;
  selectedActivityTitle?: string;
  selectedActivitySummary?: string;
  selectedAssessmentType?: FormativeAssessmentType;
  selectedAssessmentPreview?: string;
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
  classroomContext?: ClassroomContext;
  referenceMaterial?: ReferenceMaterial;
  aiDeclaration?: string;
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

export interface PlanDllInput {
  lessonTitle?: string;
  gradeAndSection: string;
  references?: string;
  classroomContext?: ClassroomContext;
  referenceMaterial?: ReferenceMaterial;
  promptNotes?: string;
  sessions: DllSessionConfig[];
}

export interface GenerateDllInput extends PlanDllInput {
  blueprint?: DllLessonBlueprint;
}

export interface DocxExport {
  filename: string;
  buffer: Buffer;
}

export type DllDocxExport = DocxExport;

export interface DlpActivityPair {
  teacherActivity: string;
  studentActivity: string;
}

export interface DlpIntentions {
  learningCompetencies: string[];
  contentStandards: string[];
  performanceStandards: string[];
  learningObjectives: string;
  learnerContext: string;
}

export interface DlpLessonBlueprint {
  mode: "scratch" | "derive";
  sourceDllId?: string;
  sourceSessionNumber?: SessionNumber;
  lessonTitle: string;
  references: string;
  competencyIds: string[];
  components: TleComponent[];
  progressionFocus: string;
  learningObjectives: string;
  activityOptions: BlueprintActivityOption[];
  selectedActivityId: string;
  assessmentOptions: BlueprintAssessmentOption[];
  selectedAssessmentType: FormativeAssessmentType;
  inheritedLearningResources?: string;
  lockedToParentSession?: boolean;
}

export interface DailyLessonPlan {
  id: string;
  createdAt: string;
  updatedAt: string;
  sourceDllId?: string;
  sourceSessionNumber?: SessionNumber;
  competencyIds: string[];
  lessonTitle: string;
  learningAreas: string;
  gradeAndSection: string;
  references: string;
  classroomContext?: ClassroomContext;
  referenceMaterial?: ReferenceMaterial;
  aiDeclaration?: string;
  selectedActivityTitle?: string;
  selectedActivitySummary?: string;
  selectedAssessmentType?: FormativeAssessmentType;
  selectedAssessmentPreview?: string;
  promptNotes: string;
  intentions: DlpIntentions;
  preLesson: DlpActivityPair;
  lessonFlow: DlpActivityPair;
  learningResources: DlpActivityPair;
  integrationAndContextualization: DlpActivityPair;
  formativeAssessment: DlpActivityPair;
  extendedLearningOpportunities: DlpActivityPair;
  reflections: DlpActivityPair;
}

export type PlanDlpInput =
  | {
      mode: "derive";
      dllId: string;
      sessionNumber: SessionNumber;
      lessonTitle?: string;
      references?: string;
      classroomContext?: ClassroomContext;
      referenceMaterial?: ReferenceMaterial;
      promptNotes?: string;
    }
  | {
      mode: "scratch";
      lessonTitle?: string;
      gradeAndSection: string;
      references?: string;
      classroomContext?: ClassroomContext;
      referenceMaterial?: ReferenceMaterial;
      promptNotes?: string;
      competencyIds: string[];
    };

export type GenerateDlpInput =
  | {
      mode: "derive";
      dllId: string;
      sessionNumber: SessionNumber;
      lessonTitle?: string;
      references?: string;
      classroomContext?: ClassroomContext;
      referenceMaterial?: ReferenceMaterial;
      promptNotes?: string;
      blueprint?: DlpLessonBlueprint;
    }
  | {
      mode: "scratch";
      lessonTitle?: string;
      gradeAndSection: string;
      references?: string;
      classroomContext?: ClassroomContext;
      referenceMaterial?: ReferenceMaterial;
      promptNotes?: string;
      competencyIds: string[];
      blueprint?: DlpLessonBlueprint;
    };

export const QUIZ_QUESTION_TYPES = [
  "multipleChoice",
  "trueFalse",
  "identification",
  "essayRubric",
] as const;
export type QuizQuestionType = (typeof QUIZ_QUESTION_TYPES)[number];

export type QuizItemCounts = Record<QuizQuestionType, number>;

export interface QuizItem {
  id: string;
  prompt: string;
  choices?: string[];
  answer: string;
  rubric?: string;
}

export interface QuizSection {
  type: QuizQuestionType;
  title: string;
  directions: string;
  items: QuizItem[];
}

export type QuizSource =
  | { kind: "dll"; dllId: string; sessionNumber: SessionNumber }
  | { kind: "dlp"; dlpId: string }
  | { kind: "standalone"; competencyIds: string[] };

export interface Quiz {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  learningAreas: string;
  gradeAndSection: string;
  promptNotes: string;
  source: QuizSource;
  competencyIds: string[];
  learningCompetencies: string[];
  sections: QuizSection[];
}

export type GenerateQuizInput =
  | {
      sourceKind: "dll";
      dllId: string;
      sessionNumber: SessionNumber;
      title?: string;
      promptNotes?: string;
      itemCounts: QuizItemCounts;
    }
  | {
      sourceKind: "dlp";
      dlpId: string;
      title?: string;
      promptNotes?: string;
      itemCounts: QuizItemCounts;
    }
  | {
      sourceKind: "standalone";
      competencyIds: string[];
      gradeAndSection: string;
      title?: string;
      promptNotes?: string;
      itemCounts: QuizItemCounts;
    };

export type QuizSyncResult =
  | { kind: "dll"; dll: DailyLessonLog }
  | { kind: "dlp"; dlp: DailyLessonPlan };

export interface GuroMateEngine {
  readonly dataDir: string;
  readonly templatesDir: string;
  getSettings(): Promise<GuroMateSettings>;
  saveSettings(patch: SettingsPatch): Promise<GuroMateSettings>;
  testAiConnection(
    aiOverride?: Partial<AiProviderSettings>,
  ): Promise<AiConnectionCheckResult>;
  listAiModels(
    aiOverride?: Partial<AiProviderSettings>,
  ): Promise<AiModelListResult>;
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
  extractReferenceMaterial(
    input: ReferenceMaterialExtractInput,
  ): Promise<ReferenceMaterialExtractResult>;
  listDlls(): Promise<DailyLessonLog[]>;
  getDll(id: string): Promise<DailyLessonLog>;
  planDll(input: PlanDllInput): Promise<DllLessonBlueprint>;
  generateDll(input: GenerateDllInput): Promise<DailyLessonLog>;
  saveDll(dll: DailyLessonLog): Promise<DailyLessonLog>;
  deleteDll(id: string): Promise<void>;
  renderDllMarkdown(dll: DailyLessonLog): string;
  exportDllDocx(id: string): Promise<DocxExport>;
  listDlps(): Promise<DailyLessonPlan[]>;
  getDlp(id: string): Promise<DailyLessonPlan>;
  planDlp(input: PlanDlpInput): Promise<DlpLessonBlueprint>;
  generateDlp(input: GenerateDlpInput): Promise<DailyLessonPlan>;
  saveDlp(dlp: DailyLessonPlan): Promise<DailyLessonPlan>;
  deleteDlp(id: string): Promise<void>;
  renderDlpMarkdown(dlp: DailyLessonPlan): string;
  exportDlpDocx(id: string): Promise<DocxExport>;
  listQuizzes(): Promise<Quiz[]>;
  getQuiz(id: string): Promise<Quiz>;
  generateQuiz(input: GenerateQuizInput): Promise<Quiz>;
  saveQuiz(quiz: Quiz): Promise<Quiz>;
  deleteQuiz(id: string): Promise<void>;
  renderQuizMarkdown(quiz: Quiz): string;
  syncQuizToLesson(id: string): Promise<QuizSyncResult>;
  exportQuizDocx(id: string): Promise<DocxExport>;
}
