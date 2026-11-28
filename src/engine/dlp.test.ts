import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    expect(systemInstruction).toMatch(/DepEd Order No\.\s*016,\s*s\.\s*2026/i);
    expect(systemInstruction).toMatch(/Learning Design Principles/i);
    expect(systemInstruction).toMatch(/MATATAG.*4Is.*4Cs.*4Es/i);
    expect(systemInstruction).toMatch(/DepEd Order No\.\s*8,\s*s\.\s*2015/i);
    expect(systemInstruction).toMatch(/4As.*5Es.*DepEd DO 42/i);
    expect(systemInstruction).toMatch(/Teacher's Activity.*Student's Activity/i);
    expect(systemInstruction).toMatch(/minute-by-minute/i);
    expect(systemInstruction).toMatch(/3.*SMART/i);
    expect(systemInstruction).toMatch(/Cognitive.*Psychomotor.*Affective/i);
    expect(systemInstruction).toContain("• ");
    expect(systemInstruction).toMatch(/greet.*prayer.*attendance/i);
    expect(systemInstruction).toMatch(/well-being/i);
    expect(systemInstruction).toMatch(/verbatim|restate/i);
    expect(systemInstruction).toMatch(/guide questions.*expected student/i);
    expect(systemInstruction).toMatch(/OHS\/PPE|OSH\/PPE/i);
    expect(systemInstruction).toMatch(/emergency\/offline/i);
    expect(systemInstruction).toMatch(/line-by-line/i);
    expect(systemInstruction).toMatch(/N\/A/);
    expect(systemInstruction).toMatch(/Answer Key|scoring criteria/i);
    expect(systemInstruction).toMatch(/help-seeking|ask for guidance/i);
    expect(systemInstruction).toMatch(/accommodations/i);
    expect(systemInstruction).not.toMatch(/Default to a 5-item multiple-choice quiz/i);
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
    expect(dlpRequest.systemInstruction).toMatch(/well-being/i);
    expect(dlpRequest.systemInstruction).toMatch(/DepEd Order No\.\s*8,\s*s\.\s*2015/i);
    expect(dlpRequest.systemInstruction).not.toMatch(/Default to a 5-item multiple-choice quiz/i);

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

  it("auto-populates DO 003 Annex A Declaration of AI Use on generated DLPs, persists per-lesson edits across Markdown and .docx, and falls back cleanly for legacy saved DLPs", async () => {
    const dataDir = await makeTempDir();
    const fakeAdapter: AiProviderAdapter = {
      async generateText() {
        return {
          text: JSON.stringify({
            lessonTitle: "DO 003 AI Declaration DLP",
            references: "MATATAG TLE 7 CG",
            learningObjectives: "• Identify safe ICT practices.",
            preLesson: { teacherActivity: "Greet and hook.", studentActivity: "Respond." },
            lessonFlow: { teacherActivity: "Model safe practices.", studentActivity: "Practice in pairs." },
            learningResources: { teacherActivity: "• Slides", studentActivity: "• Checklist" },
            integrationAndContextualization: { teacherActivity: "Local tech link.", studentActivity: "" },
            formativeAssessment: { teacherActivity: "Check rubric.", studentActivity: "Demonstrate steps." },
            extendedLearningOpportunities: { teacherActivity: "Home audit.", studentActivity: "" },
          }),
          model: "claude-sonnet-4-5",
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
        aiProvider: "anthropic",
        apiKey: "ant-test-key",
        baseUrl: "https://api.anthropic.com/v1",
        modelId: "claude-sonnet-4-5",
      },
    });

    const ict = (await engine.listCurriculum({ gradeLevel: 7, component: "ICT" }))[0]!;
    const created = await engine.generateDlp({
      mode: "scratch",
      gradeAndSection: "Grade 7 - Rizal",
      competencyIds: [ict.id],
    });

    expect(created.aiDeclaration).toBeDefined();
    expect(created.aiDeclaration).toMatch(/DepEd Order No\.\s*003,\s*s\.\s*2026/i);
    expect(created.aiDeclaration).toMatch(/Annex A/i);
    expect(created.aiDeclaration).toContain("Anthropic (claude-sonnet-4-5)");
    expect(created.aiDeclaration).toMatch(/auxiliary/i);
    expect(created.aiDeclaration).toMatch(/review|validat/i);
    expect(created.aiDeclaration).toMatch(/no confidential learner/i);
    expect(created.aiDeclaration).not.toContain("{aiTool}");

    const generatedMd = await readFile(
      path.join(dataDir, "dlps", `${created.id}.md`),
      "utf8",
    );
    expect(generatedMd).toContain(`- **Declaration of AI Use:** ${created.aiDeclaration}`);

    const customDeclaration =
      "Declaration of AI Use (DO 003, s. 2026 Annex A): Drafted with Anthropic (claude-sonnet-4-5), reviewed and adapted by teacher, with no confidential learner PII shared.";
    const edited = await engine.saveDlp({
      ...created,
      aiDeclaration: `  ${customDeclaration}  `,
    });
    expect(edited.aiDeclaration).toBe(customDeclaration);

    const editedMd = await readFile(
      path.join(dataDir, "dlps", `${created.id}.md`),
      "utf8",
    );
    expect(editedMd).toContain(`- **Declaration of AI Use:** ${customDeclaration}`);

    const { readZipEntry } = await import("./zip");
    const { extractTableCellTexts } = await import("./dllDocx");

    const editedDocx = await engine.exportDlpDocx(created.id);
    const editedTables = extractTableCellTexts(
      readZipEntry(editedDocx.buffer, "word/document.xml").toString("utf8"),
    );
    expect(editedTables[0]![7]![1]).toBe(customDeclaration);

    // Legacy saved DLP lacking aiDeclaration falls back cleanly to DO 003 Annex A statement
    const legacyDlp: Omit<DailyLessonPlan, "aiDeclaration"> = {
      ...created,
      id: "dlp-legacy-1",
      lessonTitle: "Legacy Saved DLP",
    };
    delete (legacyDlp as Partial<DailyLessonPlan>).aiDeclaration;
    await mkdir(dataDir, { recursive: true });
    await writeFile(
      path.join(dataDir, "dlps.json"),
      JSON.stringify([legacyDlp], null, 2),
      "utf8",
    );

    const legacyDocx = await engine.exportDlpDocx("dlp-legacy-1");
    const legacyTables = extractTableCellTexts(
      readZipEntry(legacyDocx.buffer, "word/document.xml").toString("utf8"),
    );
    expect(legacyTables[0]![7]![1]).toMatch(/DepEd Order No\.\s*003,\s*s\.\s*2026/i);
    expect(legacyTables[0]![7]![1]).toContain("Anthropic (claude-sonnet-4-5)");
    expect(legacyTables[0]![7]![1]).not.toContain("{aiTool}");
  });

  it("plans a scratch single-session Lesson Blueprint via planDlp and locks Step 2 generateDlp strictly to teacher-edited objectives, activity, formative assessment, and 2-hour pacing", async () => {
    const dataDir = await makeTempDir();
    const requests: AiGenerateRequest[] = [];

    const fakeAdapter: AiProviderAdapter = {
      async generateText(req) {
        requests.push(req);
        if (req.prompt.includes("single-session Lesson Blueprint")) {
          return {
            text: JSON.stringify({
              lessonTitle: "2-Hour T568B Cable Crimping Practicum",
              references: "MATATAG TLE 7 ICT CG & BoW",
              progressionFocus: "Hands-on 2-hour lab mastery of RJ45 crimping",
              learningObjectives:
                "• Cognitive: Recall the 8-wire T568B color-code sequence with 100% accuracy.\n• Psychomotor: Crimp a functional straight-through UTP cable observing OHS/PPE practices.\n• Affective: Practice patience and shared care for lab crimping tools.",
              activityOptions: [
                {
                  id: "dlp-act-1",
                  title: "Guided T568B Color-Code Sorting",
                  summary: "Pairs sort colored wire strips before crimping.",
                  source: "bow",
                  recommended: true,
                },
                {
                  id: "dlp-act-2",
                  title: "Paired Workstation Crimping & LAN Continuity Relay",
                  summary: "Pairs follow modeled OHS steps to strip, arrange, crimp, and test cables.",
                  source: "authentic",
                  recommended: true,
                },
              ],
              assessmentOptions: [
                {
                  type: "demo-rubric",
                  preview: "3-criterion rubric scoring T568B pinout accuracy, crimp quality, and OHS compliance.",
                  recommended: true,
                },
                {
                  type: "checklist",
                  preview: "6-step peer and teacher observation checklist during cable termination.",
                  recommended: false,
                },
              ],
            }),
            model: "mock-dlp-plan-model",
          };
        }

        return {
          text: JSON.stringify({
            lessonTitle: "Ignored AI Title",
            references: "MATATAG TLE 7 ICT CG",
            learningObjectives: "• AI paraphrased objective that must be overridden.",
            preLesson: {
              teacherActivity:
                "(15 min) Greet class, ask a student to lead the prayer, check attendance and learner well-being, show a faulty cable hook, and share the 3 Learning Objectives verbatim.",
              studentActivity:
                "(15 min) Respond to greeting, join prayer, share well-being check-in, answer the hook question, and read the objectives aloud.",
            },
            lessonFlow: {
              teacherActivity:
                "(85 min) Present T568B pinout points (20 min); ask guide questions; model OHS/PPE checks and step-by-step crimping (15 min); facilitate Paired Workstation Crimping & LAN Continuity Relay (40 min); lead share-back and synthesis (10 min).",
              studentActivity:
                "(85 min) Take notes on T568B pinout, answer guide questions, put on safety glasses, perform paired cable crimping and LAN testing, and share troubleshooting insights.",
            },
            learningResources: {
              teacherActivity:
                "• Crimping tools, LAN tester, projector\n• Emergency/offline backup: Printed T568B color-code chart and chalkboard diagram",
              studentActivity:
                "• UTP cable, RJ45 plugs, safety goggles\n• Emergency/offline backup: Laminated color-code practice strips",
            },
            integrationAndContextualization: {
              teacherActivity: "Connect structured cabling to barangay office and school computer lab networks.",
              studentActivity: "",
            },
            formativeAssessment: {
              teacherActivity:
                "(20 min) Observation / Skill Checklist (6 steps) with scoring criteria and Answer Key; invite learners to raise help cards for feedback; offer oral/visual checklist accommodations.",
              studentActivity:
                "(20 min) Demonstrate cable termination while checked against the checklist and use help cards if guidance is needed.",
            },
            extendedLearningOpportunities: {
              teacherActivity: "Sketch a safe cable routing plan for a home or barangay workstation.",
              studentActivity: "",
            },
          }),
          model: "mock-dlp-gen-model",
        };
      },
    };

    const engine = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: fakeAdapter,
    });

    const ictComp = (await engine.listCurriculum({ gradeLevel: 7, component: "ICT" }))[0]!;
    const classroomContext = {
      periodMinutes: 120,
      facility: "computer-lab" as const,
      modality: "face-to-face" as const,
    };
    const referenceMaterial = {
      sourceLabel: "TESDA CSS NC II Excerpt.txt",
      text: "Verify T568B order (WO-O-WG-B-WB-G-WBr-Br) and wear safety eyewear when trimming UTP conductors.",
    };

    const blueprint = await engine.planDlp({
      mode: "scratch",
      gradeAndSection: "Grade 7 - Rizal",
      competencyIds: [ictComp.id],
      classroomContext,
      referenceMaterial,
      promptNotes: "40 learners sharing 20 crimping tools in pairs.",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]!.systemInstruction).toMatch(/DepEd Order No\.\s*016/i);
    expect(requests[0]!.systemInstruction).toMatch(/Lesson Blueprint/i);
    expect(requests[0]!.prompt).toContain("120 minutes");
    expect(requests[0]!.prompt).toContain("TESDA CSS NC II Excerpt.txt");

    expect(blueprint.mode).toBe("scratch");
    expect(blueprint.lockedToParentSession).toBeFalsy();
    expect(blueprint.lessonTitle).toBe("2-Hour T568B Cable Crimping Practicum");
    expect(blueprint.learningObjectives).not.toMatch(/\b(Cognitive|Psychomotor|Affective)\s*:/i);
    expect(blueprint.learningObjectives.split("\n")).toHaveLength(3);
    expect(blueprint.activityOptions.length).toBeGreaterThanOrEqual(2);
    expect(blueprint.activityOptions.length).toBeLessThanOrEqual(3);
    const recActs = blueprint.activityOptions.filter((a) => a.recommended);
    expect(recActs).toHaveLength(1);
    expect(blueprint.selectedActivityId).toBe(recActs[0]!.id);
    expect(blueprint.assessmentOptions.map((o) => o.type)).toEqual([
      "exit-ticket",
      "checklist",
      "demo-rubric",
      "worksheet",
      "short-quiz",
    ]);
    for (const opt of blueprint.assessmentOptions) {
      expect(opt.label.trim().length).toBeGreaterThan(0);
      expect(opt.preview.trim().length).toBeGreaterThan(0);
    }
    expect(blueprint.assessmentOptions.filter((o) => o.recommended)).toHaveLength(1);
    expect(blueprint.selectedAssessmentType).toBe("demo-rubric");

    // Step 2: Teacher edits objectives, swaps activity & assessment, edits title, approves & generates DLP
    const editedObjectives = [
      "• Identify the 8-wire T568B pinout sequence with 100% accuracy.",
      "• Terminate a working straight-through RJ45 cable following OHS/PPE checks.",
      "• Demonstrate responsible teamwork and tool stewardship in the computer lab.",
    ].join("\n");

    const approvedBlueprint = {
      ...blueprint,
      lessonTitle: "Approved 2-Hour RJ45 Crimping DLP",
      learningObjectives: editedObjectives,
      selectedActivityId: "dlp-act-2",
      selectedAssessmentType: "checklist" as const,
    };

    const created = await engine.generateDlp({
      mode: "scratch",
      gradeAndSection: "Grade 7 - Rizal",
      competencyIds: [ictComp.id],
      classroomContext,
      referenceMaterial,
      promptNotes: "40 learners sharing 20 crimping tools in pairs.",
      blueprint: approvedBlueprint,
    });

    expect(requests).toHaveLength(2);
    const genPrompt = requests[1]!.prompt;
    expect(genPrompt).toContain("Approved Lesson Blueprint");
    expect(genPrompt).toContain("Paired Workstation Crimping & LAN Continuity Relay");
    expect(genPrompt).toContain("Observation / Skill Checklist");
    expect(genPrompt).toContain("120 minutes");

    expect(created.lessonTitle).toBe("Approved 2-Hour RJ45 Crimping DLP");
    expect(created.intentions.learningObjectives).toBe(editedObjectives);
    expect(created.selectedActivityTitle).toBe(
      "Paired Workstation Crimping & LAN Continuity Relay",
    );
    expect(created.selectedAssessmentType).toBe("checklist");
    expect(created.classroomContext).toEqual(classroomContext);

    // Reload from disk and verify persisted blueprint metadata
    const engine2 = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: fakeAdapter,
    });
    const reloaded = await engine2.getDlp(created.id);
    expect(reloaded.selectedActivityTitle).toBe(
      "Paired Workstation Crimping & LAN Continuity Relay",
    );
    expect(reloaded.selectedAssessmentType).toBe("checklist");
    expect(reloaded.intentions.learningObjectives).toBe(editedObjectives);

    // Export .docx preserves paired layout and leaves Learner Context + Reflections blank
    const exported = await engine2.exportDlpDocx(created.id);
    const { readZipEntry } = await import("./zip");
    const { extractTableCellTexts } = await import("./dllDocx");
    const docXml = readZipEntry(exported.buffer, "word/document.xml").toString("utf8");
    const tables = extractTableCellTexts(docXml);
    expect(tables[0]![0]![1]).toBe("Approved 2-Hour RJ45 Crimping DLP");
    expect(tables[1]![2]![1]).toContain("Terminate a working straight-through RJ45 cable");
    expect(tables[1]![3]![1]).toBe("");
    expect(tables[4]![3]![1]).toBe("");
    expect(tables[4]![3]![2]).toBe("");
  });

  it("strictly locks derived DLP planning and generation to parent DLL Session objectives, chosen activity, chosen Formative Assessment type, and key resources without drifting", async () => {
    const dataDir = await makeTempDir();
    const requests: AiGenerateRequest[] = [];

    const fakeAdapter: AiProviderAdapter = {
      async generateText(req) {
        requests.push(req);
        if (req.prompt.includes("Create an editable 5-Session Lesson Blueprint")) {
          return {
            text: JSON.stringify({
              lessonTitle: "ICT Lab Maintenance Week",
              references: "MATATAG TLE 7 ICT CG & BoW",
              sessions: [1, 2, 3, 4].map((n) => ({
                sessionNumber: n,
                progressionFocus: `Session ${n} stage`,
                learningObjectives: [
                  `• Explain maintenance step ${n} clearly.`,
                  `• Execute preventive check ${n} safely with PPE.`,
                  `• Value disciplined tool housekeeping ${n}.`,
                ].join("\n"),
                activityOptions: [
                  {
                    id: `s${n}-a`,
                    title: `Parent DLL Activity ${n}`,
                    summary: `Hands-on preventive check station ${n}.`,
                    source: "bow",
                    recommended: true,
                  },
                  {
                    id: `s${n}-b`,
                    title: `Backup Activity ${n}`,
                    summary: `Alternative review ${n}.`,
                    source: "authentic",
                    recommended: false,
                  },
                ],
                assessmentOptions: [
                  {
                    type: "demo-rubric",
                    preview: `3-criterion lab rubric for Session ${n}.`,
                    recommended: n === 2,
                  },
                  {
                    type: "exit-ticket",
                    preview: `Exit slip for Session ${n}.`,
                    recommended: n !== 2,
                  },
                ],
              })),
            }),
          };
        }
        if (req.prompt.includes("Daily Lesson Log (DLL)")) {
          return {
            text: JSON.stringify({
              lessonTitle: "ICT Lab Maintenance Week",
              references: "MATATAG TLE 7 ICT CG & BoW",
              sessions: [1, 2, 3, 4].map((n) => ({
                sessionNumber: n,
                learningObjectives: `• AI obj ${n}`,
                preLesson: `Pre-lesson ${n}`,
                lessonFlow: `Parent DLL Activity ${n}: Modeled OHS steps followed by paired practice.`,
                learningResources: `• Anti-static wrist strap and compressed air\n• Emergency/offline backup: Printed safety checklist`,
                integrationAndContextualization: `Local repair shop link ${n}.`,
                formativeAssessment: `Performance / Demo Rubric: Evaluate Session ${n} with help cards and accommodations.`,
                extendedLearningOpportunities: `Home safety audit ${n}.`,
              })),
            }),
          };
        }
        if (req.prompt.includes("single-session Lesson Blueprint")) {
          // Intentionally return drifted AI suggestions to verify strict parent DLL locking!
          return {
            text: JSON.stringify({
              lessonTitle: "Expanded Session 2 Preventive Maintenance DLP",
              references: "MATATAG TLE 7 ICT CG & BoW",
              progressionFocus: "Detailed demonstration teaching expansion of Session 2",
              learningObjectives:
                "• Drifted Cognitive Objective that MUST NOT override parent DLL.\n• Drifted Psychomotor Objective.\n• Drifted Affective Objective.",
              activityOptions: [
                {
                  id: "drifted-act",
                  title: "Unrelated Lecture Drift",
                  summary: "Pure lecture that contradicts parent DLL Session 2.",
                  source: "authentic",
                  recommended: true,
                },
              ],
              assessmentOptions: [
                {
                  type: "short-quiz",
                  preview: "Drifted quiz that contradicts parent DLL demo-rubric.",
                  recommended: true,
                },
                {
                  type: "demo-rubric",
                  preview: "Expanded 3-criterion rubric matching Session 2 lab demo.",
                  recommended: false,
                },
              ],
            }),
          };
        }

        return {
          text: JSON.stringify({
            lessonTitle: "Expanded Session 2 Preventive Maintenance DLP",
            references: "MATATAG TLE 7 ICT CG & BoW",
            learningObjectives: "• Drifted DLP objective that MUST be locked to parent DLL.",
            preLesson: {
              teacherActivity: "(15 min) Opening routine, well-being check, hook, and verbatim objectives.",
              studentActivity: "(15 min) Join routine, check-in, and read objectives.",
            },
            lessonFlow: {
              teacherActivity: "(85 min) Expand Parent DLL Activity 2 with OHS/PPE checks and guide questions.",
              studentActivity: "(85 min) Follow OHS steps and complete paired preventive check.",
            },
            learningResources: {
              teacherActivity:
                "• Anti-static wrist strap and compressed air\n• Emergency/offline backup: Printed safety checklist",
              studentActivity:
                "• Anti-static wrist strap, brush\n• Emergency/offline backup: Printed checklist",
            },
            integrationAndContextualization: {
              teacherActivity: "Local repair shop link 2.",
              studentActivity: "",
            },
            formativeAssessment: {
              teacherActivity:
                "(20 min) Performance / Demo Rubric with scoring criteria, help-seeking cue cards, and accommodations.",
              studentActivity: "(20 min) Demonstrate preventive check and consult rubric criteria.",
            },
            extendedLearningOpportunities: {
              teacherActivity: "Home safety audit 2.",
              studentActivity: "",
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

    const ictComp = (await engine.listCurriculum({ gradeLevel: 7, component: "ICT" }))[0]!;
    const dllSessions = [
      { sessionNumber: 1 as const, mode: "instructional" as const, competencyIds: [ictComp.id] },
      { sessionNumber: 2 as const, mode: "instructional" as const, competencyIds: [ictComp.id] },
      { sessionNumber: 3 as const, mode: "instructional" as const, competencyIds: [ictComp.id] },
      { sessionNumber: 4 as const, mode: "instructional" as const, competencyIds: [ictComp.id] },
      {
        sessionNumber: 5 as const,
        mode: "non-instructional" as const,
        competencyIds: [],
        nonInstructionalReason: "School Holiday",
      },
    ];
    const dllBlueprint = await engine.planDll({
      gradeAndSection: "Grade 7 - Bonifacio",
      classroomContext: {
        periodMinutes: 120,
        facility: "shop-workshop",
        modality: "face-to-face",
      },
      sessions: dllSessions,
    });
    const parentDll = await engine.generateDll({
      gradeAndSection: "Grade 7 - Bonifacio",
      classroomContext: {
        periodMinutes: 120,
        facility: "shop-workshop",
        modality: "face-to-face",
      },
      sessions: dllSessions,
      blueprint: dllBlueprint,
    });
    const parentSession2 = parentDll.sessions[1]!;

    // Reject deriving blueprint from non-instructional session
    await expect(
      engine.planDlp({
        mode: "derive",
        dllId: parentDll.id,
        sessionNumber: 5,
      }),
    ).rejects.toThrow(/non-instructional/i);

    // Step 1: Plan derived DLP from Session 2
    const derivedBlueprint = await engine.planDlp({
      mode: "derive",
      dllId: parentDll.id,
      sessionNumber: 2,
    });

    expect(derivedBlueprint.mode).toBe("derive");
    expect(derivedBlueprint.sourceDllId).toBe(parentDll.id);
    expect(derivedBlueprint.sourceSessionNumber).toBe(2);
    expect(derivedBlueprint.lockedToParentSession).toBe(true);
    expect(derivedBlueprint.learningObjectives).toBe(parentSession2.learningObjectives);
    const chosenAct = derivedBlueprint.activityOptions.find(
      (o) => o.id === derivedBlueprint.selectedActivityId,
    );
    expect(chosenAct?.title).toBe("Parent DLL Activity 2");
    expect(chosenAct?.recommended).toBe(true);
    expect(derivedBlueprint.selectedAssessmentType).toBe("demo-rubric");
    expect(
      derivedBlueprint.assessmentOptions.find((o) => o.recommended)?.type,
    ).toBe("demo-rubric");
    expect(derivedBlueprint.inheritedLearningResources).toContain("Anti-static wrist strap");

    // Step 2: Generate derived DLP — even if blueprint is tampered with, strict DLL->DLP lock holds!
    const tamperedBlueprint = {
      ...derivedBlueprint,
      learningObjectives: "• Attempted objective drift",
      selectedActivityId: "drifted-act",
      selectedAssessmentType: "short-quiz" as const,
    };
    const derivedDlp = await engine.generateDlp({
      mode: "derive",
      dllId: parentDll.id,
      sessionNumber: 2,
      blueprint: tamperedBlueprint,
    });

    const genReq = requests[requests.length - 1]!;
    expect(genReq.prompt).toContain("Parent DLL Activity 2");
    expect(genReq.prompt).toContain("Performance / Demo Rubric");
    expect(genReq.prompt).toContain("Anti-static wrist strap");
    expect(genReq.prompt).toContain("120 minutes");
    expect(genReq.prompt).toMatch(/STRICTLY LOCKED|LOCKED/i);

    expect(derivedDlp.sourceDllId).toBe(parentDll.id);
    expect(derivedDlp.sourceSessionNumber).toBe(2);
    expect(derivedDlp.intentions.learningObjectives).toBe(parentSession2.learningObjectives);
    expect(derivedDlp.selectedActivityTitle).toBe("Parent DLL Activity 2");
    expect(derivedDlp.selectedAssessmentType).toBe("demo-rubric");
    expect(derivedDlp.classroomContext?.periodMinutes).toBe(120);
  });

  it("runs deterministic DO 016 Alignment Check for DLPs with zero extra AI calls on valid output, at most 1 repair retry on missing paired fields, and live recomputation on saveDlp", async () => {
    const dataDir = await makeTempDir();
    const ict = (
      await createGuroMateEngine({
        dataDir,
        templatesDir: process.cwd(),
      }).listCurriculum({ gradeLevel: 7, component: "ICT" })
    )[0]!;

    const makeDlpJson = (overrides: Record<string, unknown> = {}) =>
      JSON.stringify({
        lessonTitle: "60-Min ICT Lab DLP",
        references: "MATATAG TLE 7 ICT CG",
        learningObjectives: [
          "• Identify core ICT tools with 90% accuracy.",
          "• Demonstrate safe workstation setup following OHS rules.",
          "• Practice responsible lab collaboration.",
        ].join("\n"),
        preLesson: {
          teacherActivity: "(10 min) Greeting, prayer, attendance, well-being check, hook, and verbatim objectives.",
          studentActivity: "(10 min) Join opening routine, share well-being check-in, and read objectives.",
        },
        lessonFlow: {
          teacherActivity: "(35 min) Present key points (10 min); guide questions and lab practice (20 min); synthesis (5 min).",
          studentActivity: "(35 min) Answer guide questions, complete guided lab practice, and share takeaways.",
        },
        learningResources: {
          teacherActivity: "• Slides, workstation\n• Emergency/offline backup: Printed visual cards and chalkboard",
          studentActivity: "• Activity sheet\n• Emergency/offline backup: Paper task cards",
        },
        integrationAndContextualization: {
          teacherActivity: "Connect to local barangay tech services.",
          studentActivity: "",
        },
        formativeAssessment: {
          teacherActivity: "(15 min) Observation checklist with rubric key. Learners raise help cards for feedback. Accommodations: oral option and visual cues.",
          studentActivity: "(15 min) Complete checklist demonstration and use help cards when seeking guidance.",
        },
        extendedLearningOpportunities: {
          teacherActivity: "List three safe device habits practiced at home.",
          studentActivity: "",
        },
        ...overrides,
      });

    // 1. Compliant DLP makes ZERO extra AI calls and passes all DO 016 checks
    const validCalls: AiGenerateRequest[] = [];
    const validEngine = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: {
        async generateText(req) {
          validCalls.push(req);
          return { text: makeDlpJson(), model: "mock-dlp-model" };
        },
      },
    });
    const compliantDlp = await validEngine.generateDlp({
      mode: "scratch",
      gradeAndSection: "Grade 7 - Rizal",
      competencyIds: [ict.id],
      classroomContext: {
        periodMinutes: 60,
        facility: "computer-lab",
        modality: "face-to-face",
      },
    });
    expect(validCalls).toHaveLength(1);
    expect(compliantDlp.alignmentCheck?.structuralValid).toBe(true);
    expect(compliantDlp.alignmentCheck?.passed).toBe(true);
    expect(compliantDlp.alignmentCheck?.autoRepaired).toBe(false);

    // 2. Missing paired Student's Activity triggers EXACTLY 1 repair retry; stops even when repair leaves period mismatch + missing emergency backup
    const repairCalls: AiGenerateRequest[] = [];
    const repairEngine = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: {
        async generateText(req) {
          repairCalls.push(req);
          if (repairCalls.length === 1) {
            return {
              text: makeDlpJson({
                lessonFlow: {
                  teacherActivity: "(35 min) Demonstrate setup.",
                  studentActivity: "",
                },
              }),
              model: "mock-dlp-model",
            };
          }
          return {
            text: makeDlpJson({
              preLesson: {
                teacherActivity: "(10 min) Routine and hook.",
                studentActivity: "(10 min) Join routine.",
              },
              lessonFlow: {
                teacherActivity: "(25 min) Demonstrate setup and guide practice.",
                studentActivity: "(25 min) Follow setup steps in pairs.",
              },
              learningResources: {
                teacherActivity: "• Projector and slides",
                studentActivity: "• Laptop",
              },
              formativeAssessment: {
                teacherActivity: "(10 min) Short quiz without accommodations.",
                studentActivity: "(10 min) Complete quiz.",
              },
            }),
            model: "mock-dlp-model",
          };
        },
      },
    });

    const repairedDlp = await repairEngine.generateDlp({
      mode: "scratch",
      gradeAndSection: "Grade 7 - Rizal",
      competencyIds: [ict.id],
      classroomContext: {
        periodMinutes: 60,
        facility: "computer-lab",
        modality: "face-to-face",
      },
    });
    expect(repairCalls).toHaveLength(2);
    expect(repairCalls[1]!.prompt).toMatch(/Lesson Flow \(Student's Activity\)/i);
    expect(repairedDlp.alignmentCheck?.structuralValid).toBe(true);
    expect(repairedDlp.alignmentCheck?.passed).toBe(false);
    expect(repairedDlp.alignmentCheck?.autoRepaired).toBe(true);
    expect(
      repairedDlp.alignmentCheck?.items.some(
        (i) => i.code === "dlp-pacing" && i.severity === "warning" && i.message.includes("45"),
      ),
    ).toBe(true);
    expect(
      repairedDlp.alignmentCheck?.items.some(
        (i) => i.code === "emergency-resources" && i.severity === "warning",
      ),
    ).toBe(true);
    expect(
      repairedDlp.alignmentCheck?.items.some(
        (i) => i.code === "formative-support" && i.severity === "warning",
      ),
    ).toBe(true);

    // 3. Inline edit + saveDlp refreshes alignmentCheck to green pass and never blocks .docx export
    const savedFixed = await repairEngine.saveDlp({
      ...repairedDlp,
      lessonFlow: {
        teacherActivity: "(40 min) Demonstrate setup and guide practice.",
        studentActivity: "(40 min) Follow setup steps in pairs.",
      },
      learningResources: {
        teacherActivity: "• Projector and slides\n• Emergency/offline backup: Printed visual cards",
        studentActivity: "• Laptop\n• Emergency/offline backup: Paper task cards",
      },
      formativeAssessment: {
        teacherActivity: "(10 min) Short quiz with Answer Key. Raise help cards for teacher feedback. Accommodations: oral option and visual cues.",
        studentActivity: "(10 min) Complete quiz and raise help cards when needing guidance.",
      },
    });
    expect(savedFixed.alignmentCheck?.structuralValid).toBe(true);
    expect(savedFixed.alignmentCheck?.passed).toBe(true);
    const exported = await repairEngine.exportDlpDocx(savedFixed.id);
    expect(exported.buffer.length).toBeGreaterThan(0);
  });
});
