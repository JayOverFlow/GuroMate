import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createGuroMateEngine } from "./createGuroMateEngine";
import { renderDllMarkdown } from "./dll";
import type { AiGenerateRequest, AiProviderAdapter, DailyLessonLog } from "./types";

describe("GuroMateEngine Daily Lesson Log (DLL)", () => {
  const tempDirs: string[] = [];

  async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "guromate-dll-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("generates a multi-component 5-Session DLL, includes Prompt Notes in AI prompt without writing to Learner Context, and persists JSON and Markdown", async () => {
    const dataDir = await makeTempDir();
    const requests: AiGenerateRequest[] = [];

    const fakeAdapter: AiProviderAdapter = {
      async generateText(req) {
        requests.push(req);
        return {
          text: JSON.stringify({
            lessonTitle: "ICT Sectors and Nail Care Tools",
            references: "MATATAG TLE Curriculum Guide; Grade 7 Budget of Work",
            sessions: [
              {
                sessionNumber: 1,
                learningObjectives: "Identify ICT sectors and career pathways.",
                preLesson: "Show local tech job postings as warm-up.",
                lessonFlow: "1. Introduce ICT sectors. 2. Sector research map.",
                learningResources: "Printed job cards, whiteboard",
                integrationAndContextualization: "Relate to local BPO and tech shops.",
                formativeAssessment: "3-item sector matching exit ticket.",
                extendedLearningOpportunities: "Interview a community tech worker.",
              },
              {
                sessionNumber: 2,
                learningObjectives: "Compare binary and decimal number systems.",
                preLesson: "Quick mental counting drill.",
                lessonFlow: "1. Explain base-2 place values. 2. Pair conversion drill.",
                learningResources: "Conversion worksheet",
                integrationAndContextualization: "Connect to digital storage sizes.",
                formativeAssessment: "Convert 5 decimal numbers to binary.",
                extendedLearningOpportunities: "Complete binary puzzle sheet.",
              },
              {
                sessionNumber: 3,
                learningObjectives: "Classify basic nail care tools and equipment.",
                preLesson: "Display sanitized salon tool kit.",
                lessonFlow: "1. Demonstrate each tool. 2. Group sorting relay.",
                learningResources: "Nail care kit, laminated labels",
                integrationAndContextualization: "Discuss hygiene in home-based services.",
                formativeAssessment: "Tool identification checklist.",
                extendedLearningOpportunities: "Inventory safe grooming tools at home.",
              },
              {
                sessionNumber: 4,
                learningObjectives: "Demonstrate proper tool sanitization steps.",
                preLesson: "Review safety checklist from Session 3.",
                lessonFlow: "1. Model sanitization steps. 2. Guided station practice.",
                learningResources: "Alcohol, cotton, tool tray",
                integrationAndContextualization: "Link to barangay sanitation standards.",
                formativeAssessment: "Performance rubric check.",
                extendedLearningOpportunities: "Draft a 5-step sanitation reminder card.",
              },
              {
                sessionNumber: 5,
                learningObjectives: "Perform basic hand spa prep safely.",
                preLesson: "Safety briefing on warm water checks.",
                lessonFlow: "1. Peer hand spa prep. 2. Teacher feedback.",
                learningResources: "Basin, towel, mild soap",
                integrationAndContextualization: "Entrepreneurship in local wellness.",
                formativeAssessment: "Peer and teacher observation checklist.",
                extendedLearningOpportunities: "Reflect on safe salon habits.",
              },
            ],
          }),
          model: "mock-model",
        };
      },
    };

    const engine1 = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: fakeAdapter,
    });
    await engine1.saveSettings({
      ai: {
        aiProvider: "ollama",
        apiKey: "",
        baseUrl: "http://localhost:11434/v1",
        modelId: "qwen2.5",
      },
    });

    const ictCompetencies = await engine1.listCurriculum({
      gradeLevel: 7,
      quarter: 1,
      component: "ICT",
    });
    const fcsCompetencies = await engine1.listCurriculum({
      gradeLevel: 7,
      component: "FCS",
    });
    const ictComp = ictCompetencies[0]!;
    const fcsComp = fcsCompetencies[0]!;

    const promptNotes =
      "45-minute periods; no live internet in shop room; use offline stations.";

    const created = await engine1.generateDll({
      gradeAndSection: "Grade 7 - Rizal",
      promptNotes,
      sessions: [
        { sessionNumber: 1, mode: "instructional", competencyIds: [ictComp.id] },
        { sessionNumber: 2, mode: "instructional", competencyIds: [ictComp.id] },
        { sessionNumber: 3, mode: "instructional", competencyIds: [fcsComp.id] },
        { sessionNumber: 4, mode: "instructional", competencyIds: [fcsComp.id] },
        { sessionNumber: 5, mode: "instructional", competencyIds: [fcsComp.id] },
      ],
    });

    expect(created.id).toMatch(/^dll-/);
    expect(created.learningAreas).toBe("ICT, FCS");
    expect(created.gradeAndSection).toBe("Grade 7 - Rizal");
    expect(created.intentions.learningCompetencies).toEqual([
      ictComp.learningCompetency,
      fcsComp.learningCompetency,
    ]);
    expect(created.intentions.contentStandards).toEqual([
      ictComp.contentStandard,
      fcsComp.contentStandard,
    ]);
    expect(created.intentions.performanceStandards).toEqual([
      ictComp.performanceStandard,
      fcsComp.performanceStandard,
    ]);
    expect(created.intentions.learnerContext).toBe("");
    expect(created.sessions).toHaveLength(5);
    expect(created.sessions.every((s) => s.reflections === "")).toBe(true);
    expect(created.sessions[0]?.components).toEqual(["ICT"]);
    expect(created.sessions[2]?.components).toEqual(["FCS"]);

    expect(requests).toHaveLength(1);
    const sentPrompt = requests[0]!.prompt;
    expect(sentPrompt).toContain(promptNotes);
    expect(sentPrompt).toContain(ictComp.contentTopic);
    expect(sentPrompt).toContain(fcsComp.contentTopic);
    expect(sentPrompt).toContain(ictComp.budgetOfWork!.suggestedActivities);

    const systemInstruction = requests[0]!.systemInstruction ?? "";
    expect(systemInstruction).toContain("ILAW Framework");
    expect(systemInstruction).toMatch(/DepEd Order No\.\s*016,\s*s\.\s*2026/i);
    expect(systemInstruction).toMatch(/Learning Design Principles/i);
    expect(systemInstruction).toMatch(/MATATAG.*IDF|4Is.*4Cs.*4Es/i);
    expect(systemInstruction).toMatch(/DepEd Order No\.\s*8,\s*s\.\s*2015/i);
    expect(systemInstruction).toMatch(/4As.*5Es.*DepEd DO 42/i);
    expect(systemInstruction).toMatch(/OSH|PPE/i);
    expect(systemInstruction).toMatch(/Budget of Work/i);
    expect(systemInstruction).toMatch(/3.*SMART/i);
    expect(systemInstruction).toMatch(/Cognitive.*Psychomotor.*Affective/i);
    expect(systemInstruction).toContain("• ");
    expect(systemInstruction).toContain("Pre-lesson activity:");
    expect(systemInstruction).toMatch(/emergency|offline/i);
    expect(systemInstruction).toMatch(/feedback|help-seeking|guidance/i);
    expect(systemInstruction).toMatch(/accommodation/i);
    expect(systemInstruction).toMatch(/constructive alignment|1-to-1/i);
    expect(systemInstruction).toMatch(/N\/A/);
    expect(systemInstruction).not.toMatch(/Default to a 5-item multiple-choice quiz/i);
    expect(systemInstruction).toContain("Prompt Notes");
    expect(systemInstruction).toContain("Learner Context");
    expect(systemInstruction).toContain("Reflections");

    const engine2 = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: fakeAdapter,
    });
    const list = await engine2.listDlls();
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(created);

    const mdOnDisk = await readFile(
      path.join(dataDir, "dlls", `${created.id}.md`),
      "utf8",
    );
    expect(mdOnDisk).toContain("ICT, FCS");
    expect(mdOnDisk).toContain("Identify ICT sectors and career pathways.");
    expect(mdOnDisk).not.toContain(promptNotes);
  });

  it("supports non-instructional sessions, inline edits via saveDll, validation errors, and deletion", async () => {
    const dataDir = await makeTempDir();
    const fakeAdapter: AiProviderAdapter = {
      async generateText() {
        return {
          text: JSON.stringify({
            lessonTitle: "Week 1 ICT Tools",
            references: "CG",
            sessions: [
              {
                sessionNumber: 1,
                learningObjectives: "Obj 1",
                preLesson: "Pre 1",
                lessonFlow: "Flow 1",
                learningResources: "Res 1",
                integrationAndContextualization: "Int 1",
                formativeAssessment: "Ass 1",
                extendedLearningOpportunities: "Ext 1",
              },
              {
                sessionNumber: 2,
                learningObjectives: "Obj 2",
                preLesson: "Pre 2",
                lessonFlow: "Flow 2",
                learningResources: "Res 2",
                integrationAndContextualization: "Int 2",
                formativeAssessment: "Ass 2",
                extendedLearningOpportunities: "Ext 2",
              },
              {
                sessionNumber: 4,
                learningObjectives: "Obj 4",
                preLesson: "Pre 4",
                lessonFlow: "Flow 4",
                learningResources: "Res 4",
                integrationAndContextualization: "Int 4",
                formativeAssessment: "Ass 4",
                extendedLearningOpportunities: "Ext 4",
              },
              {
                sessionNumber: 5,
                learningObjectives: "Obj 5",
                preLesson: "Pre 5",
                lessonFlow: "Flow 5",
                learningResources: "Res 5",
                integrationAndContextualization: "Int 5",
                formativeAssessment: "Ass 5",
                extendedLearningOpportunities: "Ext 5",
              },
            ],
          }),
        };
      },
    };

    const engine = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: fakeAdapter,
    });

    await expect(
      engine.generateDll({
        gradeAndSection: "   ",
        sessions: [
          { sessionNumber: 1, mode: "non-instructional", competencyIds: [] },
          { sessionNumber: 2, mode: "non-instructional", competencyIds: [] },
          { sessionNumber: 3, mode: "non-instructional", competencyIds: [] },
          { sessionNumber: 4, mode: "non-instructional", competencyIds: [] },
          { sessionNumber: 5, mode: "non-instructional", competencyIds: [] },
        ],
      }),
    ).rejects.toThrow(/grade level and section/i);

    const ict = (await engine.listCurriculum({ gradeLevel: 7, component: "ICT" }))[0]!;
    const created = await engine.generateDll({
      gradeAndSection: "7-Narra",
      sessions: [
        { sessionNumber: 1, mode: "instructional", competencyIds: [ict.id] },
        { sessionNumber: 2, mode: "instructional", competencyIds: [ict.id] },
        {
          sessionNumber: 3,
          mode: "non-instructional",
          competencyIds: [],
          nonInstructionalReason: "Bonifacio Day (Holiday)",
        },
        { sessionNumber: 4, mode: "instructional", competencyIds: [ict.id] },
        { sessionNumber: 5, mode: "instructional", competencyIds: [ict.id] },
      ],
    });

    expect(created.sessions[2]?.mode).toBe("non-instructional");
    expect(created.sessions[2]?.learningObjectives).toBe("Bonifacio Day (Holiday)");

    const edited = await engine.saveDll({
      ...created,
      lessonTitle: "Edited ICT Title",
      sessions: [
        { ...created.sessions[0], lessonFlow: "Updated interactive lab flow." },
        created.sessions[1],
        created.sessions[2],
        created.sessions[3],
        created.sessions[4],
      ],
    });

    expect(edited.lessonTitle).toBe("Edited ICT Title");
    const reloaded = await engine.getDll(created.id);
    expect(reloaded.sessions[0].lessonFlow).toBe("Updated interactive lab flow.");
    const md = await readFile(path.join(dataDir, "dlls", `${created.id}.md`), "utf8");
    expect(md).toContain("Edited ICT Title");
    expect(md).toContain("Updated interactive lab flow.");

    await engine.deleteDll(created.id);
    expect(await engine.listDlls()).toEqual([]);
    await expect(engine.getDll(created.id)).rejects.toThrow(/not found/i);
    await expect(engine.deleteDll(created.id)).rejects.toThrow(/not found/i);
  });

  it("exports a valid .docx by injecting DLL fields and Teacher Profile signatories into DLL_ILAW_template.docx while leaving Learner Context and Reflections blank", async () => {
    const dataDir = await makeTempDir();
    const fakeAdapter: AiProviderAdapter = {
      async generateText() {
        return {
          text: JSON.stringify({
            lessonTitle: "Multi-Component ICT & FCS Week",
            references: "MATATAG TLE CG & BoW",
            sessions: [1, 2, 3, 4, 5].map((n) => ({
              sessionNumber: n,
              learningObjectives: `Objective S${n}`,
              preLesson: `Pre-Lesson S${n}`,
              lessonFlow: `Lesson Flow S${n}`,
              learningResources: `Resources S${n}`,
              integrationAndContextualization: `Integration S${n}`,
              formativeAssessment: `Assessment S${n}`,
              extendedLearningOpportunities: `Extended S${n}`,
            })),
          }),
        };
      },
    };

    const engine = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: fakeAdapter,
    });

    await engine.saveSettings({
      profile: {
        studentTeacherName: "JUAN DELA CRUZ",
        cooperatingTeacherName: "MARIA SANTOS",
        tleCoordinatorName: "ELENA REYES",
        academicHeadName: "ROBERTO GARCIA",
        aiDeclaration: "AI-assisted and teacher-verified.",
      },
    });

    const ict = (await engine.listCurriculum({ gradeLevel: 7, component: "ICT" }))[0]!;
    const fcs = (await engine.listCurriculum({ gradeLevel: 7, component: "FCS" }))[0]!;

    const created = await engine.generateDll({
      gradeAndSection: "Grade 7 - Sampaguita",
      promptNotes: "Private shop equipment note never copied to Learner Context.",
      sessions: [
        { sessionNumber: 1, mode: "instructional", competencyIds: [ict.id] },
        { sessionNumber: 2, mode: "instructional", competencyIds: [ict.id] },
        { sessionNumber: 3, mode: "instructional", competencyIds: [fcs.id] },
        { sessionNumber: 4, mode: "instructional", competencyIds: [fcs.id] },
        {
          sessionNumber: 5,
          mode: "non-instructional",
          competencyIds: [],
          nonInstructionalReason: "School Intramurals",
        },
      ],
    });

    const exported = await engine.exportDllDocx(created.id);
    expect(exported.filename).toMatch(/\.docx$/);
    expect(exported.buffer.subarray(0, 2).toString("ascii")).toBe("PK");

    const { readZipEntry } = await import("./zip");
    const docXml = readZipEntry(exported.buffer, "word/document.xml").toString("utf8");

    expect(docXml).toContain("Multi-Component ICT &amp; FCS Week");
    expect(docXml).toContain("ICT, FCS");
    expect(docXml).toContain("Grade 7 - Sampaguita");
    expect(docXml).toContain("MATATAG TLE CG &amp; BoW");
    expect(docXml).toContain("JUAN DELA CRUZ");
    expect(docXml).toContain("MARIA SANTOS");
    expect(docXml).toContain("ELENA REYES");
    expect(docXml).toContain("ROBERTO GARCIA");
    expect(docXml).toContain("AI-assisted and teacher-verified.");
    expect(docXml).toContain(ict.learningCompetency);
    expect(docXml).toContain(fcs.learningCompetency);
    expect(docXml).toContain("Objective S1");
    expect(docXml).toContain("Lesson Flow S4");
    expect(docXml).toContain("School Intramurals");
    expect(docXml).not.toContain("Private shop equipment note");

    // Preserve left-column helper instructions from template
    expect(docXml).toContain("Learning Competency and Curriculum Standards:");
    expect(docXml).toContain("Opportunities for Integration and Contextualization:");

    // Verify Learner Context (Table 1 R4 C1) and all 5 Reflections cells (Table 4 R2 C1..C5) are completely blank
    const { extractTableCellTexts } = await import("./dllDocx");
    const tables = extractTableCellTexts(docXml);
    expect(tables[1]![4]![1]).toBe("");
    for (let col = 1; col <= 5; col++) {
      expect(tables[4]![2]![col]).toBe("");
    }
  });

  it("grounds Grade 7–12 DLL generation in BoW metadata, updates System Instructions for Tech-Pro and SHS Core, and auto-populates BoW sourceDocument references when blank", async () => {
    const dataDir = await makeTempDir();
    const requests: AiGenerateRequest[] = [];

    const fakeAdapter: AiProviderAdapter = {
      async generateText(req) {
        requests.push(req);
        return {
          text: JSON.stringify({
            lessonTitle: "SHS Core & Tech-Pro BoW Week",
            references: "",
            sessions: [1, 2, 3, 4, 5].map((n) => ({
              sessionNumber: n,
              learningObjectives: `• Objective ${n}`,
              preLesson: `Pre-lesson activity: “Hook ${n}”`,
              lessonFlow: `Activity ${n}`,
              learningResources: `• Slides`,
              integrationAndContextualization: "Philippine workplace link.",
              formativeAssessment: `Assessment ${n}`,
              extendedLearningOpportunities: `Extended ${n}`,
            })),
          }),
        };
      },
    };

    const engine = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: fakeAdapter,
    });

    const shsComp = await engine.saveCustomCompetency({
      gradeLevels: [11],
      quarters: [1],
      component: "SHS_CORE",
      sector: "General Mathematics",
      contentTopic: "Functions",
      contentStandard: "Demonstrates understanding of functions.",
      performanceStandard: "Constructs mathematical models using functions.",
      learningCompetency: "Represent real-life situations using functions.",
      budgetOfWork: {
        term: "First Term",
        weekRange: "1 to 2",
        suggestedActivities: "Barangay electric bill piecewise modeling",
        suggestedPerformanceTasks: "Community sari-sari pricing portfolio",
        sourceDocument: "Grade 11 SHS Core General Mathematics Budget of Work",
      },
    });

    const g12Comp = await engine.saveCustomCompetency({
      gradeLevels: [12],
      quarters: [1],
      component: "ICT",
      sector: "Computer Programming",
      contentTopic: "Structured Programming",
      contentStandard: "Demonstrates understanding of modular coding.",
      performanceStandard: "Builds a working console application.",
      learningCompetency: "Design modular algorithms for business workflows.",
      budgetOfWork: {
        term: "One-Term",
        weekRange: "3 to 4",
        suggestedActivities: "Pseudocode pair-debugging relay",
        suggestedPerformanceTasks: "Barangay inventory CLI prototype",
        sourceDocument: "Grade 12 Tech-Pro ICT Computer Programming Budget of Work",
      },
    });

    const autoRefDll = await engine.generateDll({
      gradeAndSection: "Grade 11 - Mabini",
      sessions: [
        { sessionNumber: 1, mode: "instructional", competencyIds: [shsComp.id] },
        { sessionNumber: 2, mode: "instructional", competencyIds: [shsComp.id] },
        { sessionNumber: 3, mode: "instructional", competencyIds: [g12Comp.id] },
        { sessionNumber: 4, mode: "instructional", competencyIds: [g12Comp.id] },
        { sessionNumber: 5, mode: "instructional", competencyIds: [g12Comp.id] },
      ],
    });

    expect(requests).toHaveLength(1);
    const sys = requests[0]!.systemInstruction ?? "";
    expect(sys).toMatch(/Grades 7[–-]12/i);
    expect(sys).toMatch(/Technical-Professional|Tech-Pro/i);
    expect(sys).toContain("SHS Core");
    expect(sys).toContain("Suggested Activities");
    expect(sys).toContain("Suggested Performance Tasks");
    expect(sys).toMatch(/Learning Experience/i);
    expect(sys).toMatch(/Assessing Learning/i);
    expect(sys).toMatch(/Ways Forward/i);

    const prompt = requests[0]!.prompt;
    expect(prompt).toContain("First Term");
    expect(prompt).toContain("Week 1 to 2");
    expect(prompt).toContain("Barangay electric bill piecewise modeling");
    expect(prompt).toContain("Community sari-sari pricing portfolio");
    expect(prompt).toContain("Grade 11 SHS Core General Mathematics Budget of Work");
    expect(prompt).toContain("One-Term");
    expect(prompt).toContain("Week 3 to 4");
    expect(prompt).toContain("Pseudocode pair-debugging relay");
    expect(prompt).toContain("Barangay inventory CLI prototype");
    expect(prompt).toContain("Grade 12 Tech-Pro ICT Computer Programming Budget of Work");

    expect(autoRefDll.learningAreas).toBe("SHS Core, ICT");
    expect(autoRefDll.learningAreas).not.toContain("SHS_CORE");
    expect(autoRefDll.references).toBe(
      "Grade 11 SHS Core General Mathematics Budget of Work; Grade 12 Tech-Pro ICT Computer Programming Budget of Work",
    );

    const customRefDll = await engine.generateDll({
      gradeAndSection: "Grade 11 - Mabini",
      references: "Teacher Custom Module 2026",
      sessions: [
        { sessionNumber: 1, mode: "instructional", competencyIds: [shsComp.id] },
        { sessionNumber: 2, mode: "instructional", competencyIds: [shsComp.id] },
        { sessionNumber: 3, mode: "instructional", competencyIds: [shsComp.id] },
        { sessionNumber: 4, mode: "instructional", competencyIds: [shsComp.id] },
        { sessionNumber: 5, mode: "instructional", competencyIds: [shsComp.id] },
      ],
    });
    expect(customRefDll.learningAreas).toBe("SHS Core");
    expect(customRefDll.learningAreas).not.toContain("SHS_CORE");
    expect(customRefDll.references).toBe("Teacher Custom Module 2026");
  });

  it("renders canonical DLL Markdown unchanged for persistence and Copy Markdown", () => {
    const makeSession = (
      sessionNumber: 1 | 2 | 3 | 4 | 5,
      overrides: Partial<DailyLessonLog["sessions"][number]> = {},
    ): DailyLessonLog["sessions"][number] => ({
      sessionNumber,
      mode: "instructional",
      competencyIds: ["c1"],
      components: ["ICT"],
      learningObjectives: `• Objective ${sessionNumber}`,
      preLesson: `Pre-Lesson ${sessionNumber}`,
      lessonFlow: `Lesson Flow ${sessionNumber}`,
      learningResources: `• Resource ${sessionNumber}`,
      integrationAndContextualization: `Integration ${sessionNumber}`,
      formativeAssessment: `1. Question ${sessionNumber}\nA) One\nB) Two`,
      extendedLearningOpportunities: `Extended ${sessionNumber}`,
      reflections: "",
      ...overrides,
    });

    const dll: DailyLessonLog = {
      id: "dll-canonical-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      lessonTitle: "Number Systems and Hospitality",
      learningAreas: "ICT, SHS Core",
      gradeAndSection: "Grade 11 - Rizal",
      references: "DepEd MATATAG CG",
      promptNotes: "Private prompt note",
      intentions: {
        learningCompetencies: ["Convert binary and decimal numbers."],
        contentStandards: ["Demonstrates understanding of number systems."],
        performanceStandards: ["Converts numbers accurately."],
        learnerContext: "",
      },
      sessions: [
        makeSession(1, { components: ["ICT"] }),
        makeSession(2, { components: ["SHS_CORE"] }),
        makeSession(3, {
          mode: "non-instructional",
          competencyIds: [],
          components: [],
          nonInstructionalReason: "Bonifacio Day",
          learningObjectives: "Bonifacio Day",
          preLesson: "",
          lessonFlow: "",
          learningResources: "",
          integrationAndContextualization: "",
          formativeAssessment: "",
          extendedLearningOpportunities: "",
        }),
        makeSession(4, { components: ["ICT"] }),
        makeSession(5, { components: ["ICT"], reflections: "Students excelled." }),
      ],
    };

    const md = renderDllMarkdown(dll);
    expect(md).toContain("# Number Systems and Hospitality\n");
    expect(md).toContain("- **Learning Area/s:** ICT, SHS Core\n");
    expect(md).toContain("- **Grade Level and Section:** Grade 11 - Rizal\n");
    expect(md).toContain("- **No. of Sessions:** 5\n");
    expect(md).toContain("- **References:** DepEd MATATAG CG\n");
    expect(md).toContain(
      "### Learner Context\n_(Left blank for manual completion)_\n",
    );
    expect(md).toContain("### Session 1 — ICT\n");
    expect(md).toContain("### Session 2 — SHS Core\n");
    expect(md).toContain("### Session 3 — Non-Instructional (Bonifacio Day)\n");
    expect(md).toContain(
      "- **Reflections:** _(Left blank for manual completion)_\n",
    );
    expect(md).toContain("- **Reflections:** Students excelled.\n");
    expect(md).not.toContain("SHS_CORE");
    expect(md).not.toContain("Private prompt note");
  });

  it("grounds DLL generation in Classroom Context (including 2-hour periods), Reference Material, and competency customNotes, persists cleanly with backward compatibility, and keeps exported Learner Context and Reflections blank", async () => {
    const dataDir = await makeTempDir();
    const requests: AiGenerateRequest[] = [];

    const fakeAdapter: AiProviderAdapter = {
      async generateText(req) {
        requests.push(req);
        return {
          text: JSON.stringify({
            lessonTitle: "Electrical Wiring Safety & Splicing",
            references: "MATATAG TLE IA CG",
            sessions: [1, 2, 3, 4, 5].map((n) => ({
              sessionNumber: n,
              learningObjectives: `• Objective ${n}`,
              preLesson: `Pre-lesson activity: “Hook ${n}”`,
              lessonFlow: `Shop Lab Activity ${n}`,
              learningResources: "• Insulated pliers\n• Offline wiring board",
              integrationAndContextualization: "Barangay electrical safety.",
              formativeAssessment: `Skill checklist ${n}`,
              extendedLearningOpportunities: `Home safety audit ${n}`,
            })),
          }),
        };
      },
    };

    const engine = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: fakeAdapter,
    });

    const iaComp = (await engine.listCurriculum({ gradeLevel: 7, component: "IA" }))[0]!;
    await engine.saveCompetencyNotes(
      iaComp.id,
      "Emphasize PPE gloves and dry-hand inspection before touching conductors.",
    );

    const classroomContext = {
      periodMinutes: 120,
      facility: "shop-workshop" as const,
      modality: "face-to-face" as const,
    };
    const referenceMaterial = {
      sourceLabel: "TESDA EIM NC II Safety Excerpt.txt",
      text: "Always verify circuit de-energization with a tester before stripping AWG 14 solid wire.",
    };
    const promptNotes = "Pair taller learners with shorter learners at bench stations.";

    const created = await engine.generateDll({
      gradeAndSection: "Grade 7 - Bonifacio",
      classroomContext,
      referenceMaterial,
      promptNotes,
      sessions: [1, 2, 3, 4, 5].map((n) => ({
        sessionNumber: n as 1 | 2 | 3 | 4 | 5,
        mode: "instructional" as const,
        competencyIds: [iaComp.id],
      })),
    });

    expect(requests).toHaveLength(1);
    const prompt = requests[0]!.prompt;
    expect(prompt).toContain("120 minutes");
    expect(prompt).toContain("2 hrs");
    expect(prompt).toMatch(/Shop\s*\/\s*Workshop/i);
    expect(prompt).toMatch(/Face-to-Face/i);
    expect(prompt).toContain("TESDA EIM NC II Safety Excerpt.txt");
    expect(prompt).toContain("Always verify circuit de-energization with a tester");
    expect(prompt).toContain("Emphasize PPE gloves and dry-hand inspection");
    expect(prompt).toContain(promptNotes);

    expect(created.classroomContext).toEqual(classroomContext);
    expect(created.intentions.learnerContext).toBe("");
    expect(created.sessions.every((s) => s.reflections === "")).toBe(true);

    // Reload from disk with a fresh engine instance and verify persistence
    const engine2 = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: fakeAdapter,
    });
    const reloaded = await engine2.getDll(created.id);
    expect(reloaded.classroomContext).toEqual(classroomContext);

    // Inline edits preserve Classroom Context
    const edited = await engine2.saveDll({
      ...reloaded,
      lessonTitle: "Updated Shop Safety DLL",
    });
    expect(edited.classroomContext).toEqual(classroomContext);

    // Exported .docx must keep Learner Context and Reflections strictly blank and never leak context/reference/promptNotes
    const exported = await engine2.exportDllDocx(edited.id);
    const { readZipEntry } = await import("./zip");
    const { extractTableCellTexts } = await import("./dllDocx");
    const docXml = readZipEntry(exported.buffer, "word/document.xml").toString("utf8");
    const tables = extractTableCellTexts(docXml);
    expect(tables[1]![4]![1]).toBe("");
    for (let col = 1; col <= 5; col++) {
      expect(tables[4]![2]![col]).toBe("");
    }
    expect(docXml).not.toContain("Always verify circuit de-energization");
    expect(docXml).not.toContain("Pair taller learners");
    expect(docXml).not.toContain("Shop / Workshop");

    // Backward compatibility: legacy saved DLL record lacking classroomContext still loads, saves, and exports cleanly
    const legacyRecord = { ...edited };
    delete legacyRecord.classroomContext;
    delete legacyRecord.referenceMaterial;
    await writeFile(
      path.join(dataDir, "dlls.json"),
      JSON.stringify([legacyRecord], null, 2),
      "utf8",
    );
    const loadedLegacy = await engine2.getDll(legacyRecord.id);
    expect(loadedLegacy.classroomContext).toBeUndefined();
    const savedLegacy = await engine2.saveDll({
      ...loadedLegacy,
      lessonTitle: "Legacy Record Resaved",
    });
    expect(savedLegacy.classroomContext).toBeUndefined();
    const legacyDocx = await engine2.exportDllDocx(savedLegacy.id);
    expect(legacyDocx.buffer.subarray(0, 2).toString("ascii")).toBe("PK");
  });

  it("auto-populates DO 003 Annex A Declaration of AI Use on generated DLLs, persists per-lesson edits across Markdown and .docx, and falls back cleanly for legacy saved DLLs", async () => {
    const dataDir = await makeTempDir();
    const fakeAdapter: AiProviderAdapter = {
      async generateText() {
        return {
          text: JSON.stringify({
            lessonTitle: "DO 003 AI Declaration DLL",
            references: "MATATAG TLE 7 CG",
            sessions: [1, 2, 3, 4, 5].map((n) => ({
              sessionNumber: n,
              learningObjectives: `• Objective ${n}`,
              preLesson: `Pre-Lesson ${n}`,
              lessonFlow: `Lesson Flow ${n}`,
              learningResources: `• Resource ${n}`,
              integrationAndContextualization: `Integration ${n}`,
              formativeAssessment: `Assessment ${n}`,
              extendedLearningOpportunities: `Extended ${n}`,
            })),
          }),
          model: "gemini-2.5-flash",
        };
      },
    };

    const engine = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: fakeAdapter,
    });

    await engine.saveSettings({
      ai: {
        aiProvider: "gemini",
        apiKey: "gem-test-key",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        modelId: "gemini-2.5-flash",
      },
    });

    const ict = (await engine.listCurriculum({ gradeLevel: 7, component: "ICT" }))[0]!;
    const created = await engine.generateDll({
      gradeAndSection: "Grade 7 - Rizal",
      sessions: [1, 2, 3, 4, 5].map((n) => ({
        sessionNumber: n as 1 | 2 | 3 | 4 | 5,
        mode: "instructional" as const,
        competencyIds: [ict.id],
      })),
    });

    expect(created.aiDeclaration).toBeDefined();
    expect(created.aiDeclaration).toMatch(/DepEd Order No\.\s*003,\s*s\.\s*2026/i);
    expect(created.aiDeclaration).toMatch(/Annex A/i);
    expect(created.aiDeclaration).toContain("Google Gemini (gemini-2.5-flash)");
    expect(created.aiDeclaration).toMatch(/auxiliary/i);
    expect(created.aiDeclaration).toMatch(/review|validat/i);
    expect(created.aiDeclaration).toMatch(/no confidential learner/i);
    expect(created.aiDeclaration).not.toContain("{aiTool}");

    const generatedMd = await readFile(
      path.join(dataDir, "dlls", `${created.id}.md`),
      "utf8",
    );
    expect(generatedMd).toContain(`- **Declaration of AI Use:** ${created.aiDeclaration}`);

    const customDeclaration =
      "Declaration of AI Use (DO 003, s. 2026 Annex A): Drafted with Google Gemini (gemini-2.5-flash) and verified by teacher for Grade 7 ICT; zero learner PII shared.";
    const edited = await engine.saveDll({
      ...created,
      aiDeclaration: `  ${customDeclaration}  `,
    });
    expect(edited.aiDeclaration).toBe(customDeclaration);

    const editedMd = await readFile(
      path.join(dataDir, "dlls", `${created.id}.md`),
      "utf8",
    );
    expect(editedMd).toContain(`- **Declaration of AI Use:** ${customDeclaration}`);

    const { readZipEntry } = await import("./zip");
    const { extractTableCellTexts } = await import("./dllDocx");

    const editedDocx = await engine.exportDllDocx(created.id);
    const editedTables = extractTableCellTexts(
      readZipEntry(editedDocx.buffer, "word/document.xml").toString("utf8"),
    );
    expect(editedTables[0]![7]![1]).toBe(customDeclaration);

    // Legacy saved DLL without aiDeclaration falls back cleanly to DO 003 Annex A template with active AI tool
    const legacyDll: Omit<DailyLessonLog, "aiDeclaration"> = {
      ...created,
      id: "dll-legacy-1",
      lessonTitle: "Legacy Saved DLL",
    };
    delete (legacyDll as Partial<DailyLessonLog>).aiDeclaration;
    await mkdir(dataDir, { recursive: true });
    await writeFile(
      path.join(dataDir, "dlls.json"),
      JSON.stringify([legacyDll], null, 2),
      "utf8",
    );

    const legacyDocx = await engine.exportDllDocx("dll-legacy-1");
    const legacyTables = extractTableCellTexts(
      readZipEntry(legacyDocx.buffer, "word/document.xml").toString("utf8"),
    );
    expect(legacyTables[0]![7]![1]).toMatch(/DepEd Order No\.\s*003,\s*s\.\s*2026/i);
    expect(legacyTables[0]![7]![1]).toContain("Google Gemini (gemini-2.5-flash)");
    expect(legacyTables[0]![7]![1]).not.toContain("{aiTool}");
  });

  it("plans an editable 5-Session Lesson Blueprint via planDll with progressive multi-session scaffolding, guaranteed (Recommended) activity and 5-type Formative Assessment selections, empty-BoW fallback cues, and preserved non-instructional sessions", async () => {
    const dataDir = await makeTempDir();
    const requests: AiGenerateRequest[] = [];

    const fakeAdapter: AiProviderAdapter = {
      async generateText(req) {
        requests.push(req);
        return {
          text: JSON.stringify({
            lessonTitle: "ICT Digital Productivity & Office Applications",
            references: "MATATAG TLE 7 ICT CG & BoW",
            sessions: [
              {
                sessionNumber: 1,
                progressionFocus: "Foundational concepts and workspace orientation",
                learningObjectives:
                  "• Cognitive: Identify key ICT productivity tools with 90% accuracy.\n• Psychomotor: Navigate basic workspace menus accurately.\n• Affective: Value responsible digital workspace habits.",
                activityOptions: [
                  {
                    id: "s1-a",
                    title: "ICT Tool Gallery Walk",
                    summary: "Teams inspect local office software screenshots and classify uses.",
                    source: "bow",
                    recommended: true,
                  },
                  {
                    id: "s1-b",
                    title: "Role-Play Helpdesk Match",
                    summary: "Pairs match barangay office tasks to the right software tool.",
                    source: "authentic",
                    recommended: true,
                  },
                ],
                assessmentOptions: [
                  {
                    type: "exit-ticket",
                    preview: "3-prompt slip matching tools to real school tasks.",
                    recommended: true,
                  },
                  {
                    type: "short-quiz",
                    preview: "5-item identification check on software menus.",
                    recommended: false,
                  },
                ],
              },
              {
                sessionNumber: 2,
                progressionFocus: "Guided document formatting practice",
                learningObjectives:
                  "• Explain formatting standards for formal documents.\n• Apply heading styles and tables to a sample barangay memo.\n• Show care for readable document layout.",
                activityOptions: [
                  {
                    id: "s2-a",
                    title: "Guided Memo Formatting Lab",
                    summary: "Step-by-step teacher modeling followed by pair formatting.",
                    source: "bow",
                    recommended: false,
                  },
                  {
                    id: "s2-b",
                    title: "Peer Layout Audit",
                    summary: "Pairs spot and fix formatting issues on printed/offline drafts.",
                    source: "authentic",
                    recommended: false,
                  },
                ],
                assessmentOptions: [
                  {
                    type: "checklist",
                    preview: "6-point observation checklist verifying margin, heading, and table formatting.",
                    recommended: true,
                  },
                ],
              },
              {
                sessionNumber: 3,
                progressionFocus: "Hands-on independent synthesis output",
                learningObjectives:
                  "• Analyze audience requirements for a community flyer.\n• Produce a one-page formatted announcement using templates.\n• Demonstrate pride in accurate, original work.",
                activityOptions: [
                  {
                    id: "s3-a",
                    title: "Community Flyer Mini-Project",
                    summary: "Learners create a localized barangay event flyer using learned formatting.",
                    source: "bow",
                    recommended: true,
                  },
                  {
                    id: "s3-b",
                    title: "Station Critique & Polish",
                    summary: "Small groups refine draft flyers using peer feedback criteria.",
                    source: "authentic",
                    recommended: false,
                  },
                ],
                assessmentOptions: [
                  {
                    type: "demo-rubric",
                    preview: "3-criterion rubric scoring layout clarity, tool accuracy, and completeness.",
                    recommended: true,
                  },
                ],
              },
              {
                sessionNumber: 4,
                progressionFocus: "Authentic workplace communication scenario",
                learningObjectives:
                  "• Distinguish concise workplace notices from informal messages.\n• Draft a 1-paragraph safety advisory for a school lab.\n• Appreciate clear, respectful workplace communication.",
                activityOptions: [
                  {
                    id: "s4-a",
                    title: "Lab Advisory Drafting Sprint",
                    summary: "Small groups convert raw incident notes into a clear posted advisory.",
                    source: "authentic",
                    recommended: true,
                  },
                ],
                assessmentOptions: [
                  {
                    type: "worksheet",
                    preview: "Structured editing worksheet comparing unclear vs. concise advisories.",
                    recommended: true,
                  },
                ],
              },
            ],
          }),
          model: "mock-plan-model",
        };
      },
    };

    const engine = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: fakeAdapter,
    });

    const ictComp = (await engine.listCurriculum({ gradeLevel: 7, component: "ICT" }))[0]!;
    const emptyBowComp = await engine.saveCustomCompetency({
      gradeLevels: [11],
      quarters: [1],
      component: "SHS_CORE",
      sector: "Effective Communication",
      contentTopic: "Workplace Notices",
      contentStandard: "Demonstrates understanding of concise workplace notices.",
      performanceStandard: "Drafts clear operational advisories.",
      learningCompetency: "Draft concise workplace advisories for school or barangay contexts.",
      budgetOfWork: {
        term: "First Term",
        weekRange: "2",
        suggestedActivities: "",
        suggestedPerformanceTasks: "",
      },
    });

    const blueprint = await engine.planDll({
      gradeAndSection: "Grade 7 - Rizal",
      classroomContext: {
        periodMinutes: 90,
        facility: "computer-lab",
        modality: "face-to-face",
      },
      referenceMaterial: {
        sourceLabel: "DepEd LE Excerpt.txt",
        text: "Always save drafts every 5 minutes using Ctrl+S and verify print preview margins.",
      },
      promptNotes: "Emphasize localized barangay documents.",
      sessions: [
        { sessionNumber: 1, mode: "instructional", competencyIds: [ictComp.id] },
        { sessionNumber: 2, mode: "instructional", competencyIds: [ictComp.id] },
        { sessionNumber: 3, mode: "instructional", competencyIds: [ictComp.id] },
        { sessionNumber: 4, mode: "instructional", competencyIds: [emptyBowComp.id] },
        {
          sessionNumber: 5,
          mode: "non-instructional",
          competencyIds: [],
          nonInstructionalReason: "Rizal Day (Holiday)",
        },
      ],
    });

    expect(requests).toHaveLength(1);
    const planPrompt = requests[0]!.prompt;
    const planSystem = requests[0]!.systemInstruction ?? "";
    expect(planSystem).toMatch(/DO 016|DepEd Order No\.\s*016/i);
    expect(planSystem).toMatch(/Lesson Blueprint/i);
    expect(planPrompt).toMatch(/Part 1 of 3/i);
    expect(planPrompt).toMatch(/Part 2 of 3/i);
    expect(planPrompt).toMatch(/Part 3 of 3/i);
    expect(planPrompt).toMatch(/no Budget of Work Suggested Activities/i);
    expect(planPrompt).toContain("90 minutes");
    expect(planPrompt).toContain("Ctrl+S");

    expect(blueprint.lessonTitle).toBe("ICT Digital Productivity & Office Applications");
    expect(blueprint.sessions).toHaveLength(5);

    // Non-instructional session preserved cleanly
    const s5 = blueprint.sessions[4];
    expect(s5.mode).toBe("non-instructional");
    expect(s5.nonInstructionalReason).toBe("Rizal Day (Holiday)");
    expect(s5.activityOptions).toEqual([]);
    expect(s5.assessmentOptions).toEqual([]);
    expect(s5.selectedAssessmentType).toBeUndefined();

    // Every instructional session meets strict Lesson Blueprint invariants
    for (const session of blueprint.sessions.slice(0, 4)) {
      expect(session.mode).toBe("instructional");
      expect(session.progressionFocus.trim().length).toBeGreaterThan(0);
      expect(session.learningObjectives).not.toMatch(/\b(Cognitive|Psychomotor|Affective)\s*:/i);
      expect(session.activityOptions.length).toBeGreaterThanOrEqual(2);
      expect(session.activityOptions.length).toBeLessThanOrEqual(3);
      const recActivities = session.activityOptions.filter((opt) => opt.recommended);
      expect(recActivities).toHaveLength(1);
      expect(session.selectedActivityId).toBe(recActivities[0]!.id);

      expect(session.assessmentOptions.map((opt) => opt.type)).toEqual([
        "exit-ticket",
        "checklist",
        "demo-rubric",
        "worksheet",
        "short-quiz",
      ]);
      for (const opt of session.assessmentOptions) {
        expect(opt.label.trim().length).toBeGreaterThan(0);
        expect(opt.preview.trim().length).toBeGreaterThan(0);
      }
      const recAssessments = session.assessmentOptions.filter((opt) => opt.recommended);
      expect(recAssessments).toHaveLength(1);
      expect(session.selectedAssessmentType).toBe(recAssessments[0]!.type);
    }

    // Specific AI recommendations preserved even after normalizing duplicates/missing entries
    expect(blueprint.sessions[0].selectedActivityId).toBe("s1-a");
    expect(blueprint.sessions[0].selectedAssessmentType).toBe("exit-ticket");
    expect(blueprint.sessions[1].selectedActivityId).toBe("s2-a");
    expect(blueprint.sessions[1].selectedAssessmentType).toBe("checklist");
    expect(blueprint.sessions[2].selectedAssessmentType).toBe("demo-rubric");
    expect(blueprint.sessions[3].selectedAssessmentType).toBe("worksheet");
    // Session 4 had only 1 AI activity option, so engine ensures at least 2 concrete options
    expect(blueprint.sessions[3].activityOptions.length).toBeGreaterThanOrEqual(2);
  });

  it("locks Step 2 generateDll strictly to teacher-edited Lesson Blueprint objectives, chosen activity, and chosen Formative Assessment, persists session metadata, and exports valid ILAW .docx", async () => {
    const dataDir = await makeTempDir();
    const requests: AiGenerateRequest[] = [];

    const fakeAdapter: AiProviderAdapter = {
      async generateText(req) {
        requests.push(req);
        if (req.prompt.includes("Create an editable 5-Session Lesson Blueprint")) {
          return {
            text: JSON.stringify({
              lessonTitle: "Planned ICT Productivity Week",
              references: "MATATAG TLE 7 ICT CG",
              sessions: [1, 2, 3, 4].map((n) => ({
                sessionNumber: n,
                progressionFocus: `Stage ${n} focus`,
                learningObjectives: `• Explain concept ${n}.\n• Demonstrate skill ${n}.\n• Value safe practice ${n}.`,
                activityOptions: [
                  {
                    id: `s${n}-a`,
                    title: `Primary Activity ${n}`,
                    summary: `Primary summary ${n}.`,
                    source: "bow",
                    recommended: true,
                  },
                  {
                    id: `s${n}-b`,
                    title: `Alternative Shop Activity ${n}`,
                    summary: `Hands-on collaborative station ${n}.`,
                    source: "authentic",
                    recommended: false,
                  },
                ],
                assessmentOptions: [
                  {
                    type: "exit-ticket",
                    preview: `Exit slip check for session ${n}.`,
                    recommended: true,
                  },
                  {
                    type: "checklist",
                    preview: `Observation checklist for session ${n}.`,
                    recommended: false,
                  },
                  {
                    type: "demo-rubric",
                    preview: `3-criterion demo rubric for session ${n}.`,
                    recommended: false,
                  },
                  {
                    type: "worksheet",
                    preview: `Activity worksheet for session ${n}.`,
                    recommended: false,
                  },
                  {
                    type: "short-quiz",
                    preview: `Short quiz for session ${n}.`,
                    recommended: false,
                  },
                ],
              })),
            }),
            model: "mock-model",
          };
        }

        return {
          text: JSON.stringify({
            lessonTitle: "AI Suggested Override Title",
            references: "MATATAG TLE 7 ICT CG",
            sessions: [1, 2, 3, 4].map((n) => ({
              sessionNumber: n,
              learningObjectives: `• AI paraphrased objective ${n}.`,
              preLesson: `Pre-lesson activity: “Warm-Up ${n}” Check learner well-being and share objectives.`,
              lessonFlow: `Alternative Shop Activity ${n}: Guided demo before collaborative practice.`,
              learningResources: `• Projector & slides\n• Emergency/offline backup: Printed visual cards and chalkboard diagram`,
              integrationAndContextualization: "Connect to local barangay computer shop operations.",
              formativeAssessment: `Performance / Demo Rubric: Score session ${n}. Raise help cards for teacher feedback; offer oral/visual accommodations.`,
              extendedLearningOpportunities: `Practice task ${n} at home.`,
            })),
          }),
          model: "mock-model",
        };
      },
    };

    const engine = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: fakeAdapter,
    });

    const ictComp = (await engine.listCurriculum({ gradeLevel: 7, component: "ICT" }))[0]!;
    const sessions = [
      { sessionNumber: 1 as const, mode: "instructional" as const, competencyIds: [ictComp.id] },
      { sessionNumber: 2 as const, mode: "instructional" as const, competencyIds: [ictComp.id] },
      { sessionNumber: 3 as const, mode: "instructional" as const, competencyIds: [ictComp.id] },
      { sessionNumber: 4 as const, mode: "instructional" as const, competencyIds: [ictComp.id] },
      {
        sessionNumber: 5 as const,
        mode: "non-instructional" as const,
        competencyIds: [],
        nonInstructionalReason: "School Foundation Day",
      },
    ];

    const blueprint = await engine.planDll({
      gradeAndSection: "Grade 7 - Rizal",
      classroomContext: {
        periodMinutes: 60,
        facility: "computer-lab",
        modality: "face-to-face",
      },
      sessions,
    });

    // Teacher edits Lesson Title, Session 1 objectives, swaps activity to s1-b and assessment to demo-rubric
    const editedObjectives = [
      "• Identify three core ICT productivity tools with 100% accuracy.",
      "• Configure a clean document workspace safely on a lab workstation.",
      "• Appreciate ethical digital practices in Philippine workplaces.",
    ].join("\n");

    const approvedBlueprint = {
      ...blueprint,
      lessonTitle: "Teacher-Approved ICT Week",
      sessions: [
        {
          ...blueprint.sessions[0],
          learningObjectives: editedObjectives,
          selectedActivityId: "s1-b",
          selectedAssessmentType: "demo-rubric" as const,
        },
        blueprint.sessions[1],
        blueprint.sessions[2],
        blueprint.sessions[3],
        blueprint.sessions[4],
      ] as typeof blueprint.sessions,
    };

    const created = await engine.generateDll({
      gradeAndSection: "Grade 7 - Rizal",
      classroomContext: {
        periodMinutes: 60,
        facility: "computer-lab",
        modality: "face-to-face",
      },
      sessions,
      blueprint: approvedBlueprint,
    });

    expect(requests).toHaveLength(2);
    const step2Prompt = requests[1]!.prompt;
    expect(step2Prompt).toContain("Approved Lesson Blueprint");
    expect(step2Prompt).toContain(editedObjectives);
    expect(step2Prompt).toContain("Alternative Shop Activity 1");
    expect(step2Prompt).toContain("Performance / Demo Rubric");
    expect(step2Prompt).toContain("3-criterion demo rubric for session 1.");

    // Locked lesson title, locked Session 1 objectives verbatim, and persisted choice metadata
    expect(created.lessonTitle).toBe("Teacher-Approved ICT Week");
    expect(created.sessions[0].learningObjectives).toBe(editedObjectives);
    expect(created.sessions[0].lessonFlow).toContain("Alternative Shop Activity 1");
    expect(created.sessions[0].learningResources).toMatch(/emergency\/offline backup/i);
    expect(created.sessions[0].formativeAssessment).toContain("Performance / Demo Rubric");
    expect(created.sessions[0].progressionFocus).toBe("Stage 1 focus");
    expect(created.sessions[0].selectedActivityTitle).toBe("Alternative Shop Activity 1");
    expect(created.sessions[0].selectedActivitySummary).toBe("Hands-on collaborative station 1.");
    expect(created.sessions[0].selectedAssessmentType).toBe("demo-rubric");
    expect(created.sessions[0].selectedAssessmentPreview).toBe(
      "3-criterion demo rubric for session 1.",
    );
    expect(created.sessions[4].mode).toBe("non-instructional");
    expect(created.sessions[4].selectedAssessmentType).toBeUndefined();

    // Persists metadata cleanly across disk reload and saveDll edits
    const reloaded = await engine.getDll(created.id);
    expect(reloaded.sessions[0].selectedActivityTitle).toBe("Alternative Shop Activity 1");
    expect(reloaded.sessions[0].selectedAssessmentType).toBe("demo-rubric");

    const saved = await engine.saveDll({
      ...reloaded,
      sessions: [
        { ...reloaded.sessions[0], lessonFlow: "Refined station instructions." },
        reloaded.sessions[1],
        reloaded.sessions[2],
        reloaded.sessions[3],
        reloaded.sessions[4],
      ],
    });
    expect(saved.sessions[0].selectedActivityTitle).toBe("Alternative Shop Activity 1");
    expect(saved.sessions[0].selectedAssessmentType).toBe("demo-rubric");

    // Exported .docx contains locked objectives and keeps Learner Context & Reflections blank
    const exported = await engine.exportDllDocx(saved.id);
    const { readZipEntry } = await import("./zip");
    const { extractTableCellTexts } = await import("./dllDocx");
    const docXml = readZipEntry(exported.buffer, "word/document.xml").toString("utf8");
    expect(docXml).toContain("Teacher-Approved ICT Week");
    expect(docXml).toContain("Configure a clean document workspace safely on a lab workstation.");
    const tables = extractTableCellTexts(docXml);
    expect(tables[1]![4]![1]).toBe("");
    for (let col = 1; col <= 5; col++) {
      expect(tables[4]![2]![col]).toBe("");
    }
  });
});
