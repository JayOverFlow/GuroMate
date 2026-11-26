import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createGuroMateEngine } from "./createGuroMateEngine";
import type { AiGenerateRequest, AiProviderAdapter } from "./types";

describe("GuroMateEngine Formative Quiz Maker", () => {
  const tempDirs: string[] = [];

  async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "guromate-quiz-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("generates a standalone Quiz from Learning Competencies, persists JSON and Markdown with Answer Key, and validates item counts", async () => {
    const dataDir = await makeTempDir();
    const requests: AiGenerateRequest[] = [];

    const fakeAdapter: AiProviderAdapter = {
      async generateText(req) {
        requests.push(req);
        return {
          text: JSON.stringify({
            title: "ICT Sectors Quick Check",
            sections: [
              {
                type: "multipleChoice",
                directions: "Choose the letter of the best answer.",
                items: [
                  {
                    prompt: "Which ICT sector focuses on writing software?",
                    choices: [
                      "Computer Programming",
                      "Visual Arts",
                      "Telecommunications",
                      "Computer Systems Servicing",
                    ],
                    answer: "A. Computer Programming",
                  },
                  {
                    prompt: "Which sector maintains hardware and networks?",
                    choices: [
                      "Visual Arts",
                      "Computer Systems Servicing",
                      "Animation",
                      "Illustration",
                    ],
                    answer: "B. Computer Systems Servicing",
                  },
                ],
              },
              {
                type: "trueFalse",
                directions: "Write True if the statement is correct and False if not.",
                items: [
                  {
                    prompt: "Graphic design belongs under ICT Visual Arts.",
                    answer: "True",
                  },
                ],
              },
              {
                type: "identification",
                directions: "Identify the term described in each item.",
                items: [
                  {
                    prompt: "The TLE sector that installs and repairs PCs.",
                    answer: "Computer Systems Servicing",
                  },
                ],
              },
              {
                type: "essayRubric",
                directions: "Answer briefly in 2-3 sentences.",
                items: [
                  {
                    prompt: "Explain why digital literacy matters in local businesses.",
                    answer: "Sample response: Digital literacy improves record-keeping and customer reach.",
                    rubric: "2 pts clear explanation; 1 pt local example.",
                  },
                ],
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

    const ict = (await engine1.listCurriculum({ gradeLevel: 7, component: "ICT" }))[0]!;
    const promptNotes = "Keep vocabulary at Grade 7 reading level.";

    await expect(
      engine1.generateQuiz({
        sourceKind: "standalone",
        gradeAndSection: "Grade 7 - Rizal",
        competencyIds: [ict.id],
        itemCounts: {
          multipleChoice: 0,
          trueFalse: 0,
          identification: 0,
          essayRubric: 0,
        },
      }),
    ).rejects.toThrow(/at least one quiz item/i);

    const created = await engine1.generateQuiz({
      sourceKind: "standalone",
      gradeAndSection: "Grade 7 - Rizal",
      competencyIds: [ict.id],
      promptNotes,
      itemCounts: {
        multipleChoice: 2,
        trueFalse: 1,
        identification: 1,
        essayRubric: 1,
      },
    });

    expect(created.id).toMatch(/^quiz-/);
    expect(created.title).toBe("ICT Sectors Quick Check");
    expect(created.learningAreas).toBe("ICT");
    expect(created.gradeAndSection).toBe("Grade 7 - Rizal");
    expect(created.source).toEqual({
      kind: "standalone",
      competencyIds: [ict.id],
    });
    expect(created.sections).toHaveLength(4);
    expect(created.sections[0]!.items).toHaveLength(2);
    expect(created.sections[3]!.items[0]!.rubric).toContain("2 pts");

    expect(requests).toHaveLength(1);
    expect(requests[0]!.systemInstruction).toBeUndefined();
    expect(requests[0]!.prompt).toContain(promptNotes);
    expect(requests[0]!.prompt).toContain(ict.learningCompetency);

    const engine2 = createGuroMateEngine({
      dataDir,
      templatesDir: process.cwd(),
      aiAdapter: fakeAdapter,
    });
    expect(await engine2.listQuizzes()).toEqual([created]);
    expect(await engine2.getQuiz(created.id)).toEqual(created);

    const mdOnDisk = await readFile(
      path.join(dataDir, "quizzes", `${created.id}.md`),
      "utf8",
    );
    expect(mdOnDisk).toContain("# ICT Sectors Quick Check");
    expect(mdOnDisk).toContain("## Part I. Multiple Choice");
    expect(mdOnDisk).toContain("## Answer Key");
    expect(mdOnDisk).toContain("A. Computer Programming");
    expect(mdOnDisk).not.toContain(promptNotes);
  });

  it("links Quizzes to a DLL Session or DLP, supports inline editing and deletion, and syncs questions into lesson Formative Assessment", async () => {
    const dataDir = await makeTempDir();
    const fakeAdapter: AiProviderAdapter = {
      async generateText(req) {
        if (req.prompt.includes("Daily Lesson Log (DLL)")) {
          return {
            text: JSON.stringify({
              lessonTitle: "ICT Week 1 DLL",
              references: "MATATAG CG",
              sessions: [1, 2, 3, 4].map((n) => ({
                sessionNumber: n,
                learningObjectives: `DLL Obj S${n}`,
                preLesson: `Pre S${n}`,
                lessonFlow: `Flow S${n}`,
                learningResources: `Res S${n}`,
                integrationAndContextualization: `Int S${n}`,
                formativeAssessment: `Original DLL FA S${n}`,
                extendedLearningOpportunities: `Ext S${n}`,
              })),
            }),
          };
        }
        if (req.prompt.includes("Daily Lesson Plan (DLP)")) {
          return {
            text: JSON.stringify({
              lessonTitle: "ICT Safety DLP",
              references: "MATATAG CG",
              learningObjectives: "Identify OHS hazards.",
              preLesson: { teacherActivity: "T1", studentActivity: "S1" },
              lessonFlow: { teacherActivity: "T2", studentActivity: "S2" },
              learningResources: { teacherActivity: "T3", studentActivity: "S3" },
              integrationAndContextualization: { teacherActivity: "T4", studentActivity: "S4" },
              formativeAssessment: {
                teacherActivity: "Original DLP T",
                studentActivity: "Original DLP S",
              },
              extendedLearningOpportunities: { teacherActivity: "T5", studentActivity: "S5" },
            }),
          };
        }
        return {
          text: JSON.stringify({
            title: "Linked Formative Quiz",
            sections: [
              {
                type: "multipleChoice",
                directions: "Pick the best option.",
                items: [
                  {
                    prompt: "First safety step before opening a PC?",
                    choices: [
                      "Unplug power cord",
                      "Wash hands with water",
                      "Remove RAM first",
                      "Turn monitor brightness up",
                    ],
                    answer: "A. Unplug power cord",
                  },
                ],
              },
              {
                type: "identification",
                directions: "Name the tool.",
                items: [
                  {
                    prompt: "Strap worn to prevent static discharge.",
                    answer: "Anti-static wrist strap",
                  },
                ],
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
    const ict = (await engine.listCurriculum({ gradeLevel: 7, component: "ICT" }))[0]!;

    const dll = await engine.generateDll({
      gradeAndSection: "Grade 7 - Rizal",
      sessions: [
        { sessionNumber: 1, mode: "instructional", competencyIds: [ict.id] },
        { sessionNumber: 2, mode: "instructional", competencyIds: [ict.id] },
        { sessionNumber: 3, mode: "instructional", competencyIds: [ict.id] },
        { sessionNumber: 4, mode: "instructional", competencyIds: [ict.id] },
        {
          sessionNumber: 5,
          mode: "non-instructional",
          competencyIds: [],
          nonInstructionalReason: "Holiday",
        },
      ],
    });

    await expect(
      engine.generateQuiz({
        sourceKind: "dll",
        dllId: dll.id,
        sessionNumber: 5,
        itemCounts: { multipleChoice: 1, trueFalse: 0, identification: 0, essayRubric: 0 },
      }),
    ).rejects.toThrow(/non-instructional/i);

    const dllQuiz = await engine.generateQuiz({
      sourceKind: "dll",
      dllId: dll.id,
      sessionNumber: 2,
      itemCounts: { multipleChoice: 1, trueFalse: 0, identification: 1, essayRubric: 0 },
    });
    expect(dllQuiz.source).toEqual({ kind: "dll", dllId: dll.id, sessionNumber: 2 });
    expect(dllQuiz.gradeAndSection).toBe("Grade 7 - Rizal");

    // Inline edit directions, question, choice, and answer
    const edited = await engine.saveQuiz({
      ...dllQuiz,
      title: "Edited Session 2 Quiz",
      sections: dllQuiz.sections.map((sec, idx) =>
        idx === 0
          ? {
              ...sec,
              directions: "Encircle the letter of the correct answer.",
              items: sec.items.map((item) => ({
                ...item,
                prompt: "What is the first safety step before servicing a PC?",
                choices: ["Unplug power cable", ...(item.choices?.slice(1) ?? [])],
                answer: "A. Unplug power cable",
              })),
            }
          : sec,
      ),
    });
    expect(edited.title).toBe("Edited Session 2 Quiz");
    expect((await engine.getQuiz(edited.id)).sections[0]!.items[0]!.prompt).toBe(
      "What is the first safety step before servicing a PC?",
    );

    const dllSync = await engine.syncQuizToLesson(edited.id);
    expect(dllSync.kind).toBe("dll");
    const updatedDll = await engine.getDll(dll.id);
    expect(updatedDll.sessions[1]!.formativeAssessment).toContain("Edited Session 2 Quiz");
    expect(updatedDll.sessions[1]!.formativeAssessment).toContain(
      "What is the first safety step before servicing a PC?",
    );
    expect(updatedDll.sessions[1]!.formativeAssessment).not.toContain("Anti-static wrist strap");
    expect(updatedDll.sessions[0]!.formativeAssessment).toBe("Original DLL FA S1");

    const dlp = await engine.generateDlp({
      mode: "scratch",
      gradeAndSection: "Grade 7 - Bonifacio",
      competencyIds: [ict.id],
    });
    const dlpQuiz = await engine.generateQuiz({
      sourceKind: "dlp",
      dlpId: dlp.id,
      itemCounts: { multipleChoice: 1, trueFalse: 0, identification: 1, essayRubric: 0 },
    });
    expect(dlpQuiz.source).toEqual({ kind: "dlp", dlpId: dlp.id });

    const dlpSync = await engine.syncQuizToLesson(dlpQuiz.id);
    expect(dlpSync.kind).toBe("dlp");
    const updatedDlp = await engine.getDlp(dlp.id);
    expect(updatedDlp.formativeAssessment.studentActivity).toContain(
      "First safety step before opening a PC?",
    );
    expect(updatedDlp.formativeAssessment.teacherActivity).toContain(dlpQuiz.title);

    await engine.deleteQuiz(edited.id);
    await expect(engine.getQuiz(edited.id)).rejects.toThrow(/not found/i);
  });

  it("exports a printable .docx with student header, numbered sections, and a hard page break before the Answer Key", async () => {
    const dataDir = await makeTempDir();
    const fakeAdapter: AiProviderAdapter = {
      async generateText() {
        return {
          text: JSON.stringify({
            title: "TLE ICT Tools & Safety Quiz",
            sections: [
              {
                type: "multipleChoice",
                directions: "Choose the correct letter.",
                items: [
                  {
                    prompt: "Which tool tightens Phillips screws?",
                    choices: ["Phillips screwdriver", "Flathead", "Pliers", "Tester"],
                    answer: "A. Phillips screwdriver",
                  },
                ],
              },
              {
                type: "trueFalse",
                directions: "Write True or False.",
                items: [
                  {
                    prompt: "Wear dry hands when handling cords.",
                    answer: "True",
                  },
                ],
              },
              {
                type: "essayRubric",
                directions: "Explain in 2 sentences.",
                items: [
                  {
                    prompt: "Why keep workbenches clutter-free?",
                    answer: "Prevents accidents and tool damage.",
                    rubric: "2 pts safety reason.",
                  },
                ],
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
    const ict = (await engine.listCurriculum({ gradeLevel: 7, component: "ICT" }))[0]!;
    const quiz = await engine.generateQuiz({
      sourceKind: "standalone",
      gradeAndSection: "Grade 7 - Narra",
      competencyIds: [ict.id],
      promptNotes: "Internal teacher pacing note never printed.",
      itemCounts: {
        multipleChoice: 1,
        trueFalse: 1,
        identification: 0,
        essayRubric: 1,
      },
    });

    const exported = await engine.exportQuizDocx(quiz.id);
    expect(exported.filename).toMatch(/^Quiz-.*\.docx$/);
    expect(exported.buffer.subarray(0, 2).toString("ascii")).toBe("PK");

    const { readZipEntry } = await import("./zip");
    const contentTypes = readZipEntry(exported.buffer, "[Content_Types].xml").toString("utf8");
    const rels = readZipEntry(exported.buffer, "_rels/.rels").toString("utf8");
    const docXml = readZipEntry(exported.buffer, "word/document.xml").toString("utf8");

    expect(contentTypes).toContain("word/document.xml");
    expect(rels).toContain("word/document.xml");

    expect(docXml).toContain("TLE ICT Tools &amp; Safety Quiz");
    expect(docXml).toContain("Name");
    expect(docXml).toContain("Grade &amp; Section");
    expect(docXml).toContain("Grade 7 - Narra");
    expect(docXml).toContain("Date");
    expect(docXml).toContain("Score");
    expect(docXml).toContain("Part I. Multiple Choice");
    expect(docXml).toContain("Part II. True or False");
    expect(docXml).toContain("Part III. Essay / Performance Task");
    expect(docXml).toContain("Which tool tightens Phillips screws?");
    expect(docXml).toContain("A. Phillips screwdriver");
    expect(docXml).not.toContain("Internal teacher pacing note");

    const pageBreakMatch = docXml.match(/<w:br\s+w:type="page"\s*\/>/);
    expect(pageBreakMatch).not.toBeNull();
    const breakIndex = pageBreakMatch!.index!;
    const studentPageXml = docXml.slice(0, breakIndex);
    const answerPageXml = docXml.slice(breakIndex);

    expect(studentPageXml).toContain("Which tool tightens Phillips screws?");
    expect(studentPageXml).not.toContain("Answer Key");
    expect(answerPageXml).toContain("Answer Key");
    expect(answerPageXml).toContain("A. Phillips screwdriver");
    expect(answerPageXml).toContain("Prevents accidents and tool damage.");
  });

  it("grounds Grade 7–12 Quiz generation prompts in BoW pacing, Suggested Activities, Suggested Performance Tasks, and sourceDocument citations", async () => {
    const dataDir = await makeTempDir();
    const requests: AiGenerateRequest[] = [];

    const fakeAdapter: AiProviderAdapter = {
      async generateText(req) {
        requests.push(req);
        return {
          text: JSON.stringify({
            title: "SHS Core Functions Formative Quiz",
            sections: [
              {
                type: "essayRubric",
                directions: "Complete the performance task using the rubric.",
                items: [
                  {
                    prompt: "Model a barangay tricycle fare table as a piecewise function.",
                    answer: "Sample piecewise function with base fare and per-km increment.",
                    rubric: "3 pts accurate formula; 2 pts clear explanation.",
                  },
                ],
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

    const shsComp = await engine.saveCustomCompetency({
      gradeLevels: [11],
      quarters: [1],
      component: "SHS_CORE",
      sector: "General Mathematics",
      contentTopic: "Functions",
      contentStandard: "Demonstrates understanding of key concepts of functions.",
      performanceStandard: "Constructs mathematical models using functions.",
      learningCompetency: "Represent real-life situations using functions.",
      budgetOfWork: {
        term: "First Term",
        weekRange: "1 to 2",
        suggestedActivities: "Barangay utility bill modeling workshop",
        suggestedPerformanceTasks: "Local tricycle fare piecewise function portfolio",
        sourceDocument: "Grade 11 SHS Core General Mathematics Budget of Work",
      },
    });

    await engine.generateQuiz({
      sourceKind: "standalone",
      gradeAndSection: "Grade 11 - Rizal",
      competencyIds: [shsComp.id],
      promptNotes: "Use Philippine peso examples.",
      itemCounts: {
        multipleChoice: 0,
        trueFalse: 0,
        identification: 0,
        essayRubric: 1,
      },
    });

    expect(requests).toHaveLength(1);
    const prompt = requests[0]!.prompt;
    expect(prompt).toMatch(/Grades 7[–-]12/i);
    expect(prompt).toMatch(/Technical-Professional|Tech-Pro/i);
    expect(prompt).toContain("SHS Core");
    expect(prompt).toContain("Suggested Performance Tasks");
    expect(prompt).toContain("Prompt Notes");
    expect(prompt).toContain("First Term");
    expect(prompt).toContain("Week 1 to 2");
    expect(prompt).toContain("Barangay utility bill modeling workshop");
    expect(prompt).toContain("Local tricycle fare piecewise function portfolio");
    expect(prompt).toContain("Grade 11 SHS Core General Mathematics Budget of Work");
  });
});
