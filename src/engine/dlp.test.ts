import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createGuroMateEngine } from "./createGuroMateEngine";
import { renderDlpMarkdown } from "./dlp";
import type {
  AiGenerateRequest,
  AiProviderAdapter,
  DailyLessonPlan,
} from "./types";

describe("GuroMateEngine Daily Lesson Plan (DLP)", () => {
  const tempDirs: string[] = [];

  async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "guromate-dlp-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("generates a scratch DLP with paired Teacher's and Student's Activity, keeps Prompt Notes out of Learner Context, and persists JSON and Markdown", async () => {
    const dataDir = await makeTempDir();
    const requests: AiGenerateRequest[] = [];

    const fakeAdapter: AiProviderAdapter = {
      async generateText(req) {
        requests.push(req);
        return {
          text: JSON.stringify({
            lessonTitle: "ICT Sectors Exploration",
            references: "MATATAG TLE 7 CG; ICT Budget of Work",
            learningObjectives:
              "1. Identify career opportunities across ICT sectors.\n2. Present a local ICT career map.",
            preLesson: {
              teacherActivity: "Show local tech job cards and ask warm-up questions.",
              studentActivity: "Sort job cards and share prior knowledge.",
            },
            lessonFlow: {
              teacherActivity: "Present the four ICT sectors and facilitate group mapping.",
              studentActivity: "Complete the sector graphic organizer in pairs.",
            },
            learningResources: {
              teacherActivity: "Distribute printed job cards and rubric sheets.",
              studentActivity: "Use job cards and Manila paper for group output.",
            },
            integrationAndContextualization: {
              teacherActivity: "Connect ICT careers to local barangay digital services.",
              studentActivity: "List two local businesses that rely on ICT skills.",
            },
            formativeAssessment: {
              teacherActivity: "Administer 3-item sector matching exit ticket.",
              studentActivity: "Answer exit ticket independently and submit.",
            },
            extendedLearningOpportunities: {
              teacherActivity: "Assign a brief interview with a community tech worker.",
              studentActivity: "Record three job skills used by a community worker.",
            },
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

    const ictComps = await engine1.listCurriculum({
      gradeLevel: 7,
      quarter: 1,
      component: "ICT",
    });
    const comp1 = ictComps[0]!;
    const comp2 = ictComps[1]!;
    const promptNotes = "45-minute period; projector unavailable; use printed cards.";

    const created = await engine1.generateDlp({
      mode: "scratch",
      gradeAndSection: "Grade 7 - Rizal",
      competencyIds: [comp1.id, comp2.id],
      promptNotes,
    });

    expect(created.id).toMatch(/^dlp-/);
    expect(created.sourceDllId).toBeUndefined();
    expect(created.learningAreas).toBe("ICT");
    expect(created.gradeAndSection).toBe("Grade 7 - Rizal");
    expect(created.competencyIds).toEqual([comp1.id, comp2.id]);
    expect(created.intentions.learningCompetencies).toEqual([
      comp1.learningCompetency,
      comp2.learningCompetency,
    ]);
    expect(created.intentions.contentStandards).toEqual([
      ...new Set([comp1.contentStandard, comp2.contentStandard]),
    ]);
    expect(created.intentions.performanceStandards).toEqual([
      ...new Set([comp1.performanceStandard, comp2.performanceStandard]),
    ]);
    expect(created.intentions.learningObjectives).toContain("Identify career opportunities");
    expect(created.intentions.learnerContext).toBe("");
    expect(created.preLesson).toEqual({
      teacherActivity: "Show local tech job cards and ask warm-up questions.",
      studentActivity: "Sort job cards and share prior knowledge.",
    });
    expect(created.formativeAssessment.studentActivity).toBe(
      "Answer exit ticket independently and submit.",
    );
    expect(created.reflections).toEqual({
      teacherActivity: "",
      studentActivity: "",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]!.prompt).toContain(promptNotes);
    expect(requests[0]!.prompt).toContain(comp1.learningCompetency);
    expect(requests[0]!.prompt).toContain(comp2.learningCompetency);

    const systemInstruction = requests[0]!.systemInstruction ?? "";
    expect(systemInstruction).toContain("ILAW Framework");
    expect(systemInstruction).toMatch(/4As.*5Es.*DepEd DO 42/i);
    expect(systemInstruction).toMatch(/Teacher's Activity.*Student's Activity/i);
    expect(systemInstruction).toMatch(/3.*SMART/i);
    expect(systemInstruction).toMatch(/Cognitive.*Psychomotor.*Affective/i);
    expect(systemInstruction).toContain("• ");
    expect(systemInstruction).toMatch(/greet.*prayer.*attendance/i);
    expect(systemInstruction).toMatch(/verbatim|restate/i);
    expect(systemInstruction).toMatch(/line-by-line/i);
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
    const list = await engine2.listDlps();
    expect(list).toEqual([created]);

    const mdOnDisk = await readFile(
      path.join(dataDir, "dlps", `${created.id}.md`),
      "utf8",
    );
    expect(mdOnDisk).toContain("No. of Sessions:** 1");
    expect(mdOnDisk).toContain("Teacher's Activity");
    expect(mdOnDisk).toContain("Student's Activity");
    expect(mdOnDisk).not.toContain(promptNotes);
  });

  it("derives a DLP from an active DLL Session, rejects non-instructional sessions, and supports getDlp, saveDlp, and deleteDlp", async () => {
    const dataDir = await makeTempDir();
    const requests: AiGenerateRequest[] = [];

    const fakeAdapter: AiProviderAdapter = {
      async generateText(req) {
        requests.push(req);
        if (req.prompt.includes("Daily Lesson Log (DLL)")) {
          return {
            text: JSON.stringify({
              lessonTitle: "ICT & FCS Combined Week",
              references: "MATATAG TLE CG & BoW",
              sessions: [1, 2, 3, 4].map((n) => ({
                sessionNumber: n,
                learningObjectives: `Unpacked Objective S${n}`,
                preLesson: `DLL Pre-Lesson S${n}`,
                lessonFlow: `DLL Lesson Flow S${n}`,
                learningResources: `DLL Resources S${n}`,
                integrationAndContextualization: `DLL Integration S${n}`,
                formativeAssessment: `DLL Assessment S${n}`,
                extendedLearningOpportunities: `DLL Extended S${n}`,
              })),
            }),
          };
        }
        return {
          text: JSON.stringify({
            lessonTitle: "FCS Nail Care Tools — Session 3",
            references: "MATATAG TLE 7 FCS CG",
            learningObjectives: "AI fallback objectives",
            preLesson: {
              teacherActivity: "Display sanitized salon kit.",
              studentActivity: "Name familiar grooming tools.",
            },
            lessonFlow: {
              teacherActivity: "Demonstrate each nail care tool.",
              studentActivity: "Classify tools by function in pairs.",
            },
            learningResources: {
              teacherActivity: "Provide tool tray and sorting cards.",
              studentActivity: "Sort laminated cards with partner.",
            },
            integrationAndContextualization: {
              teacherActivity: "Discuss barangay salon hygiene standards.",
              studentActivity: "Share safe home grooming habits.",
            },
            formativeAssessment: {
              teacherActivity: "Observe tool classification checklist.",
              studentActivity: "Complete 5-item tool matching sheet.",
            },
            extendedLearningOpportunities: {
              teacherActivity: "Assign home grooming tool safety check.",
              studentActivity: "List 3 safe storage practices at home.",
            },
          }),
        };
      },
    };

    const engine = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: fakeAdapter,
    });

    const ict = (await engine.listCurriculum({ gradeLevel: 7, component: "ICT" }))[0]!;
    const fcs = (await engine.listCurriculum({ gradeLevel: 7, component: "FCS" }))[0]!;

    const dll = await engine.generateDll({
      gradeAndSection: "Grade 7 - Sampaguita",
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

    await expect(
      engine.generateDlp({
        mode: "derive",
        dllId: dll.id,
        sessionNumber: 5,
      }),
    ).rejects.toThrow(/non-instructional/i);

    const derived = await engine.generateDlp({
      mode: "derive",
      dllId: dll.id,
      sessionNumber: 3,
      promptNotes: "Use paired lab stations for 40 learners.",
    });

    expect(derived.sourceDllId).toBe(dll.id);
    expect(derived.sourceSessionNumber).toBe(3);
    expect(derived.learningAreas).toBe("FCS");
    expect(derived.gradeAndSection).toBe("Grade 7 - Sampaguita");
    expect(derived.references).toContain("MATATAG TLE CG & BoW");
    expect(derived.references).toContain(
      "Grade 7/[G7] TLE_ AFA _ FCS _ IA.pdf",
    );
    expect(derived.intentions.learningCompetencies).toEqual([fcs.learningCompetency]);
    expect(derived.intentions.contentStandards).toEqual([fcs.contentStandard]);
    expect(derived.intentions.performanceStandards).toEqual([fcs.performanceStandard]);
    expect(derived.intentions.learningObjectives).toBe("Unpacked Objective S3");
    expect(derived.intentions.learnerContext).toBe("");

    const dlpRequest = requests[1]!;
    expect(dlpRequest.prompt).toContain("DLL Lesson Flow S3");
    expect(dlpRequest.prompt).toContain("Use paired lab stations for 40 learners.");
    expect(dlpRequest.systemInstruction).toContain("Daily Lesson Plan (DLP)");
    expect(dlpRequest.systemInstruction).toContain("ILAW Framework");
    expect(dlpRequest.systemInstruction).toMatch(/greet.*prayer.*attendance/i);
    expect(dlpRequest.systemInstruction).toMatch(/5-item multiple-choice quiz/i);

    const edited = await engine.saveDlp({
      ...derived,
      lessonTitle: "Edited FCS Nail Care DLP",
      lessonFlow: {
        teacherActivity: "Model safe tool handling step-by-step.",
        studentActivity: "Practice safe tool grip in triads.",
      },
    });
    expect(edited.lessonTitle).toBe("Edited FCS Nail Care DLP");

    const reloaded = await engine.getDlp(derived.id);
    expect(reloaded.lessonFlow.studentActivity).toBe("Practice safe tool grip in triads.");

    const md = await readFile(path.join(dataDir, "dlps", `${derived.id}.md`), "utf8");
    expect(md).toContain("Edited FCS Nail Care DLP");
    expect(md).toContain("Practice safe tool grip in triads.");

    await expect(
      engine.saveDlp({ ...edited, lessonTitle: "   " }),
    ).rejects.toThrow(/lesson title/i);

    await engine.deleteDlp(derived.id);
    expect(await engine.listDlps()).toEqual([]);
    await expect(engine.getDlp(derived.id)).rejects.toThrow(/not found/i);
    await expect(engine.deleteDlp(derived.id)).rejects.toThrow(/not found/i);
  });

  it("exports a valid .docx by injecting DLP fields, paired activities, and signatories into DLP_ILAW_template.docx while leaving Learner Context and both Reflections cells blank", async () => {
    const dataDir = await makeTempDir();
    const fakeAdapter: AiProviderAdapter = {
      async generateText() {
        return {
          text: JSON.stringify({
            lessonTitle: "ICT & Safety Tools Practicum",
            references: "MATATAG TLE 7 CG & BoW",
            learningObjectives: "Demonstrate safe ICT tool handling.",
            preLesson: {
              teacherActivity: "Teacher Pre-Lesson prompt",
              studentActivity: "Student Pre-Lesson response",
            },
            lessonFlow: {
              teacherActivity: "Teacher Lesson Flow demo",
              studentActivity: "Student Lesson Flow practice",
            },
            learningResources: {
              teacherActivity: "Teacher Resources checklist",
              studentActivity: "Student Resources toolkit",
            },
            integrationAndContextualization: {
              teacherActivity: "Teacher Integration prompt",
              studentActivity: "Student Integration example",
            },
            formativeAssessment: {
              teacherActivity: "Teacher Assessment rubric",
              studentActivity: "Student Assessment performance",
            },
            extendedLearningOpportunities: {
              teacherActivity: "Teacher Extended task",
              studentActivity: "Student Extended reflection log",
            },
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
    const created = await engine.generateDlp({
      mode: "scratch",
      gradeAndSection: "Grade 7 - Rizal",
      competencyIds: [ict.id],
      promptNotes: "Private shop equipment note never copied to Learner Context.",
    });

    const edited = await engine.saveDlp({
      ...created,
      intentions: { ...created.intentions, learnerContext: "Should stay blank in docx" },
      reflections: {
        teacherActivity: "Should stay blank T",
        studentActivity: "Should stay blank S",
      },
    });

    const exported = await engine.exportDlpDocx(edited.id);
    expect(exported.filename).toMatch(/^DLP-.*\.docx$/);
    expect(exported.buffer.subarray(0, 2).toString("ascii")).toBe("PK");

    const { readZipEntry } = await import("./zip");
    const docXml = readZipEntry(exported.buffer, "word/document.xml").toString("utf8");

    expect(docXml).toContain("ICT &amp; Safety Tools Practicum");
    expect(docXml).toContain("Grade 7 - Rizal");
    expect(docXml).toContain("JUAN DELA CRUZ");
    expect(docXml).toContain("MARIA SANTOS");
    expect(docXml).toContain("ELENA REYES");
    expect(docXml).toContain("ROBERTO GARCIA");
    expect(docXml).toContain("AI-assisted and teacher-verified.");
    expect(docXml).toContain(ict.learningCompetency);
    expect(docXml).not.toContain("Private shop equipment note");

    // Preserve left-column helper instructions from template
    expect(docXml).toContain("Learning Competency and Curriculum Standards:");
    expect(docXml).toContain("Opportunities for Integration and Contextualization:");

    const { extractTableCellTexts } = await import("./dllDocx");
    const tables = extractTableCellTexts(docXml);
    expect(tables[0]![5]![1]).toBe("1");
    expect(tables[1]![2]![1]).toBe("Demonstrate safe ICT tool handling.");
    expect(tables[1]![3]![1]).toBe("");
    expect(tables[2]![2]![1]).toBe("Teacher Pre-Lesson prompt");
    expect(tables[2]![2]![2]).toBe("Student Pre-Lesson response");
    expect(tables[2]![3]![1]).toBe("Teacher Lesson Flow demo");
    expect(tables[2]![3]![2]).toBe("Student Lesson Flow practice");
    expect(tables[2]![4]![1]).toBe("Teacher Resources checklist");
    expect(tables[2]![4]![2]).toBe("Student Resources toolkit");
    expect(tables[2]![5]![1]).toBe("Teacher Integration prompt");
    expect(tables[2]![5]![2]).toBe("Student Integration example");
    expect(tables[3]![2]![1]).toBe("Teacher Assessment rubric");
    expect(tables[3]![2]![2]).toBe("Student Assessment performance");
    expect(tables[4]![2]![1]).toBe("Teacher Extended task");
    expect(tables[4]![2]![2]).toBe("Student Extended reflection log");
    expect(tables[4]![3]![1]).toBe("");
    expect(tables[4]![3]![2]).toBe("");
    expect(tables[5]![0]![0]).toBe("JUAN DELA CRUZ");
    expect(tables[6]![1]![0]).toBe("MARIA SANTOS");
    expect(tables[6]![1]![1]).toBe("ELENA REYES");
    expect(tables[6]![1]![2]).toBe("ROBERTO GARCIA");
  });

  it("grounds Grade 7–12 DLP generation in BoW metadata, updates System Instructions for Tech-Pro and SHS Core, and auto-populates BoW sourceDocument references when blank", async () => {
    const dataDir = await makeTempDir();
    const requests: AiGenerateRequest[] = [];

    const fakeAdapter: AiProviderAdapter = {
      async generateText(req) {
        requests.push(req);
        return {
          text: JSON.stringify({
            lessonTitle: "Grade 12 Tech-Pro BoW Practicum",
            references: "DepEd MATATAG Curriculum Guide",
            learningObjectives: "• Design a structured algorithm.",
            preLesson: { teacherActivity: "Greet and hook.", studentActivity: "Respond." },
            lessonFlow: { teacherActivity: "Guide lab.", studentActivity: "Build prototype." },
            learningResources: { teacherActivity: "• Slides", studentActivity: "• Worksheet" },
            integrationAndContextualization: { teacherActivity: "Local business link.", studentActivity: "" },
            formativeAssessment: { teacherActivity: "Facilitate check.", studentActivity: "Complete task." },
            extendedLearningOpportunities: { teacherActivity: "Home extension.", studentActivity: "" },
          }),
        };
      },
    };

    const engine = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: fakeAdapter,
    });

    const g12Comp = await engine.saveCustomCompetency({
      gradeLevels: [12],
      quarters: [1],
      component: "ICT",
      sector: "Computer Programming",
      contentTopic: "Modular Algorithms",
      contentStandard: "Demonstrates understanding of modular coding.",
      performanceStandard: "Builds a working console application.",
      learningCompetency: "Design modular algorithms for business workflows.",
      budgetOfWork: {
        term: "One-Term",
        weekRange: "5 to 6",
        suggestedActivities: "Pseudocode pair-debugging sprint",
        suggestedPerformanceTasks: "Barangay inventory CLI prototype",
        sourceDocument: "Grade 12 Tech-Pro ICT Computer Programming Budget of Work",
      },
    });

    const autoRefDlp = await engine.generateDlp({
      mode: "scratch",
      gradeAndSection: "Grade 12 - Turing",
      competencyIds: [g12Comp.id],
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
    expect(prompt).toContain("One-Term");
    expect(prompt).toContain("Week 5 to 6");
    expect(prompt).toContain("Pseudocode pair-debugging sprint");
    expect(prompt).toContain("Barangay inventory CLI prototype");
    expect(prompt).toContain("Grade 12 Tech-Pro ICT Computer Programming Budget of Work");

    expect(autoRefDlp.references).toBe(
      "DepEd MATATAG Curriculum Guide; Grade 12 Tech-Pro ICT Computer Programming Budget of Work",
    );

    const customRefDlp = await engine.generateDlp({
      mode: "scratch",
      gradeAndSection: "Grade 12 - Turing",
      competencyIds: [g12Comp.id],
      references: "Teacher Custom Handout p. 8",
    });
    expect(customRefDlp.references).toBe("Teacher Custom Handout p. 8");

    const shsComp = (
      await engine.listCurriculum({ gradeLevel: 11, component: "SHS_CORE" })
    )[0]!;
    const shsScratchDlp = await engine.generateDlp({
      mode: "scratch",
      gradeAndSection: "Grade 11 - Mabini",
      competencyIds: [shsComp.id],
    });
    expect(shsScratchDlp.learningAreas).toBe("SHS Core");
    expect(shsScratchDlp.learningAreas).not.toContain("SHS_CORE");
  });

  it("renders canonical DLP Markdown unchanged for persistence and Copy Markdown", () => {
    const derivedDlp: DailyLessonPlan = {
      id: "dlp-canonical-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      sourceDllId: "dll-parent-7",
      sourceSessionNumber: 2,
      competencyIds: ["c1"],
      lessonTitle: "Number Systems Conversion",
      learningAreas: "ICT, SHS Core",
      gradeAndSection: "Grade 11 - Rizal",
      references: "DepEd MATATAG CG",
      promptNotes: "Private prompt note must not appear",
      intentions: {
        learningCompetencies: ["Convert binary and decimal numbers."],
        contentStandards: ["Demonstrates understanding of number systems."],
        performanceStandards: ["Converts numbers accurately."],
        learningObjectives:
          "• Convert 4-bit binary numbers to decimal.\n• Value *precision* in digital work.",
        learnerContext: "",
      },
      preLesson: {
        teacherActivity: "Greet class, pray, check attendance, and present hook.",
        studentActivity: "Respond to greeting and state the objectives.",
      },
      lessonFlow: {
        teacherActivity: "Model place-value table and facilitate pair drills.",
        studentActivity: "Solve binary conversions in pairs.",
      },
      learningResources: {
        teacherActivity: "• Slide deck\n• Place-value chart",
        studentActivity: "• Conversion worksheet",
      },
      integrationAndContextualization: {
        teacherActivity: "Relate binary codes to local barcode scanners.",
        studentActivity: "",
      },
      formativeAssessment: {
        teacherActivity:
          "1. What is binary 1010 in decimal?\nA) 8\nB) 10\nC) 12\nD) 14",
        studentActivity: "Answer the 5-item quiz independently.",
      },
      extendedLearningOpportunities: {
        teacherActivity: "Convert your birth day to binary at home.",
        studentActivity: "",
      },
      reflections: {
        teacherActivity: "",
        studentActivity: "",
      },
    };

    const derivedMd = renderDlpMarkdown(derivedDlp);
    expect(derivedMd).toContain("# Number Systems Conversion\n");
    expect(derivedMd).toContain("- **Learning Area/s:** ICT, SHS Core\n");
    expect(derivedMd).toContain("- **Grade Level and Section:** Grade 11 - Rizal\n");
    expect(derivedMd).toContain("- **No. of Sessions:** 1\n");
    expect(derivedMd).toContain("- **References:** DepEd MATATAG CG\n");
    expect(derivedMd).toContain("- **Derived From:** dll-parent-7 (Session 2)\n");
    expect(derivedMd).toContain(
      "### Learning Objectives\n• Convert 4-bit binary numbers to decimal.\n• Value *precision* in digital work.\n",
    );
    expect(derivedMd).toContain(
      "### Learner Context\n_(Left blank for manual completion)_\n",
    );
    expect(derivedMd).toContain("## Learning Experience\n");
    expect(derivedMd).toContain(
      "### Opportunities for Integration and Contextualization\n- **Teacher's Activity:** Relate binary codes to local barcode scanners.\n- **Student's Activity:** —\n",
    );
    expect(derivedMd).toContain("## Assessing Learning\n");
    expect(derivedMd).toContain(
      "### Formative Assessment\n- **Teacher's Activity:** 1. What is binary 1010 in decimal?\nA) 8\nB) 10\nC) 12\nD) 14\n- **Student's Activity:** Answer the 5-item quiz independently.\n",
    );
    expect(derivedMd).toContain("## Ways Forward\n");
    expect(derivedMd).toContain(
      "### Reflections\n- **Teacher's Activity:** _(Left blank for manual completion)_\n- **Student's Activity:** _(Left blank for manual completion)_\n",
    );
    expect(derivedMd).not.toContain("Private prompt note must not appear");

    const standaloneDlp: DailyLessonPlan = {
      ...derivedDlp,
      sourceDllId: undefined,
      sourceSessionNumber: undefined,
      references: "",
      intentions: {
        ...derivedDlp.intentions,
        learnerContext: "Learners excel in visual charts.",
      },
      reflections: {
        teacherActivity: "Pacing worked well.",
        studentActivity: "Requested extra practice.",
      },
    };

    const standaloneMd = renderDlpMarkdown(standaloneDlp);
    expect(standaloneMd).not.toContain("**Derived From:**");
    expect(standaloneMd).toContain("- **References:** —\n");
    expect(standaloneMd).toContain(
      "### Learner Context\nLearners excel in visual charts.\n",
    );
    expect(standaloneMd).toContain(
      "### Reflections\n- **Teacher's Activity:** Pacing worked well.\n- **Student's Activity:** Requested extra practice.\n",
    );
  });

  it("grounds scratch and derived DLPs in Classroom Context (including 2-hour periods), Reference Material, and competency customNotes, inherits parent DLL Classroom Context when deriving, persists backward-compatibly, and leaves exported Learner Context and Reflections blank", async () => {
    const dataDir = await makeTempDir();
    const requests: AiGenerateRequest[] = [];

    const fakeAdapter: AiProviderAdapter = {
      async generateText(req) {
        requests.push(req);
        if (req.prompt.includes("Daily Lesson Log (DLL)")) {
          return {
            text: JSON.stringify({
              lessonTitle: "Computer Lab Networking Week",
              references: "MATATAG TLE ICT CG",
              sessions: [1, 2, 3, 4, 5].map((n) => ({
                sessionNumber: n,
                learningObjectives: `• Session ${n} objective`,
                preLesson: `Pre ${n}`,
                lessonFlow: `Flow ${n}`,
                learningResources: "• Ethernet cable\n• Printed diagram",
                integrationAndContextualization: "School LAN link.",
                formativeAssessment: `Checklist ${n}`,
                extendedLearningOpportunities: `Ext ${n}`,
              })),
            }),
          };
        }
        return {
          text: JSON.stringify({
            lessonTitle: "RJ45 Straight-Through Cable Crimping",
            references: "MATATAG TLE ICT CG",
            learningObjectives: "• Assemble a working T568B straight-through cable.",
            preLesson: { teacherActivity: "Greet and warm up.", studentActivity: "Respond." },
            lessonFlow: { teacherActivity: "Demonstrate T568B color code.", studentActivity: "Crimp cable in pairs." },
            learningResources: { teacherActivity: "• Crimping tool", studentActivity: "• UTP cable" },
            integrationAndContextualization: { teacherActivity: "Local ISP wiring.", studentActivity: "" },
            formativeAssessment: { teacherActivity: "Test cable with LAN tester.", studentActivity: "Verify 1-8 LEDs." },
            extendedLearningOpportunities: { teacherActivity: "Sketch home router layout.", studentActivity: "" },
          }),
        };
      },
    };

    const engine = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: fakeAdapter,
    });

    const ictComp = (await engine.listCurriculum({ gradeLevel: 7, component: "ICT" }))[0]!;
    await engine.saveCompetencyNotes(
      ictComp.id,
      "Remind learners to inspect RJ45 pin alignment before crimping.",
    );

    const scratchContext = {
      periodMinutes: 120,
      facility: "computer-lab" as const,
      modality: "blended" as const,
    };
    const refMaterial = {
      sourceLabel: "DepEd LAS - T568B Wiring.docx",
      text: "T568B pinout order: White-Orange, Orange, White-Green, Blue, White-Blue, Green, White-Brown, Brown.",
    };
    const promptNotes = "Rotate 20 crimping tools across 40 learners in pairs.";

    const scratchDlp = await engine.generateDlp({
      mode: "scratch",
      gradeAndSection: "Grade 7 - Mabini",
      competencyIds: [ictComp.id],
      classroomContext: scratchContext,
      referenceMaterial: refMaterial,
      promptNotes,
    });

    expect(requests).toHaveLength(1);
    const scratchPrompt = requests[0]!.prompt;
    expect(scratchPrompt).toContain("120 minutes");
    expect(scratchPrompt).toContain("2 hrs");
    expect(scratchPrompt).toMatch(/Computer Lab/i);
    expect(scratchPrompt).toMatch(/Blended/i);
    expect(scratchPrompt).toContain("DepEd LAS - T568B Wiring.docx");
    expect(scratchPrompt).toContain("T568B pinout order: White-Orange");
    expect(scratchPrompt).toContain("Remind learners to inspect RJ45 pin alignment");
    expect(scratchPrompt).toContain(promptNotes);

    expect(scratchDlp.classroomContext).toEqual(scratchContext);
    expect(scratchDlp.intentions.learnerContext).toBe("");
    expect(scratchDlp.reflections).toEqual({ teacherActivity: "", studentActivity: "" });

    // Persistence across fresh engine instance & saveDlp
    const engine2 = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: fakeAdapter,
    });
    const reloaded = await engine2.getDlp(scratchDlp.id);
    expect(reloaded.classroomContext).toEqual(scratchContext);
    const saved = await engine2.saveDlp({ ...reloaded, lessonTitle: "Updated Crimping DLP" });
    expect(saved.classroomContext).toEqual(scratchContext);

    // Exported .docx must keep Learner Context & Reflections strictly blank and never leak context/ref/promptNotes
    const exported = await engine2.exportDlpDocx(saved.id);
    const { readZipEntry } = await import("./zip");
    const { extractTableCellTexts } = await import("./dllDocx");
    const docXml = readZipEntry(exported.buffer, "word/document.xml").toString("utf8");
    const tables = extractTableCellTexts(docXml);
    expect(tables[1]![3]![1]).toBe("");
    expect(tables[4]![3]![1]).toBe("");
    expect(tables[4]![3]![2]).toBe("");
    expect(docXml).not.toContain("T568B pinout order");
    expect(docXml).not.toContain("Rotate 20 crimping tools");
    expect(docXml).not.toContain("Computer Lab");

    // Derive mode inherits parent DLL Classroom Context and Reference Material when omitted
    const parentDll = await engine2.generateDll({
      gradeAndSection: "Grade 7 - Mabini",
      classroomContext: {
        periodMinutes: 90,
        facility: "shop-workshop",
        modality: "face-to-face",
      },
      referenceMaterial: {
        sourceLabel: "Parent DLL Exemplar.pdf",
        text: "Parent DLL technical safety procedure for wiring benches.",
      },
      sessions: [1, 2, 3, 4, 5].map((n) => ({
        sessionNumber: n as 1 | 2 | 3 | 4 | 5,
        mode: "instructional" as const,
        competencyIds: [ictComp.id],
      })),
    });

    const derivedDlp = await engine2.generateDlp({
      mode: "derive",
      dllId: parentDll.id,
      sessionNumber: 1,
    });
    expect(derivedDlp.classroomContext).toEqual({
      periodMinutes: 90,
      facility: "shop-workshop",
      modality: "face-to-face",
    });
    const derivedPrompt = requests[requests.length - 1]!.prompt;
    expect(derivedPrompt).toContain("90 minutes");
    expect(derivedPrompt).toMatch(/Shop\s*\/\s*Workshop/i);
    expect(derivedPrompt).toContain("Parent DLL technical safety procedure");

    // Backward compatibility: legacy saved DLP lacking classroomContext still loads, saves, and exports cleanly
    const { writeFile } = await import("node:fs/promises");
    const legacyDlp = { ...saved };
    delete legacyDlp.classroomContext;
    delete legacyDlp.referenceMaterial;
    await writeFile(
      path.join(dataDir, "dlps.json"),
      JSON.stringify([legacyDlp], null, 2),
      "utf8",
    );
    const loadedLegacy = await engine2.getDlp(legacyDlp.id);
    expect(loadedLegacy.classroomContext).toBeUndefined();
    const resavedLegacy = await engine2.saveDlp({
      ...loadedLegacy,
      lessonTitle: "Legacy DLP Resaved",
    });
    expect(resavedLegacy.classroomContext).toBeUndefined();
    const legacyDocx = await engine2.exportDlpDocx(resavedLegacy.id);
    expect(legacyDocx.buffer.subarray(0, 2).toString("ascii")).toBe("PK");
  });
});
