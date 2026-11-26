import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createGuroMateEngine } from "./createGuroMateEngine";
import type { AiGenerateRequest, AiProviderAdapter } from "./types";

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
    expect(systemInstruction).toMatch(/4As.*5Es.*DepEd DO 42/i);
    expect(systemInstruction).toMatch(/OSH|PPE/i);
    expect(systemInstruction).toMatch(/Budget of Work/i);
    expect(systemInstruction).toMatch(/3.*SMART/i);
    expect(systemInstruction).toMatch(/Cognitive.*Psychomotor.*Affective/i);
    expect(systemInstruction).toContain("• ");
    expect(systemInstruction).toContain("Pre-lesson activity:");
    expect(systemInstruction).toMatch(/N\/A/);
    expect(systemInstruction).toMatch(/5-item multiple-choice quiz/i);
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
});
