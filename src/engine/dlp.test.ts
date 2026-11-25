import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createGuroMateEngine } from "./createGuroMateEngine";
import type { AiGenerateRequest, AiProviderAdapter } from "./types";

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
    expect(derived.references).toBe("MATATAG TLE CG & BoW");
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
});
