import { describe, expect, it } from "vitest";
import {
  mapGrade12TechProCluster,
  mergeBowIntoCatalog,
  normalizeBowTerm,
  parseBowDocument,
  type ParsedBowRow,
} from "./bowIngestion";
import type { CurriculumCompetency } from "./types";

describe("mapGrade12TechProCluster", () => {
  it("maps all 9 Grade 12 Tech-Pro clusters (including Maritime split) to TLE Components per ADR-0003", () => {
    // ICT
    expect(
      mapGrade12TechProCluster(
        "ICT SUPPORT AND COMPUTER PROGRAMMING TECHNOLOGIES",
        "Computer Programming (Java)",
      ),
    ).toBe("ICT");
    expect(
      mapGrade12TechProCluster(
        "CREATIVE ARTS AND DESIGN TECHNOLOGIES",
        "Animation",
      ),
    ).toBe("ICT");

    // FCS
    expect(
      mapGrade12TechProCluster(
        "AESTHETIC, WELLNESS, AND HUMAN CARE",
        "Aesthetic Services (Beauty Care)",
      ),
    ).toBe("FCS");
    expect(
      mapGrade12TechProCluster(
        "ARTISANRY AND CREATIVE ENTERPRISE",
        "Garments Artisanry",
      ),
    ).toBe("FCS");
    expect(
      mapGrade12TechProCluster(
        "HOSPITALITY AND TOURISM",
        "Bakery Operations",
      ),
    ).toBe("FCS");
    expect(
      mapGrade12TechProCluster("MARITIME", "Ships Catering Services"),
    ).toBe("FCS");

    // IA
    expect(
      mapGrade12TechProCluster(
        "CONSTRUCTION AND BUILDING TECHNOLOGIES",
        "Carpentry",
      ),
    ).toBe("IA");
    expect(
      mapGrade12TechProCluster(
        "AUTOMOTIVE AND SMALL ENGINE TECHNOLOGIES",
        "Driving and Automotive Servicing",
      ),
    ).toBe("IA");
    expect(
      mapGrade12TechProCluster(
        "INDUSTRIAL TECHNOLOGIES",
        "Electrical Installation and Maintenance",
      ),
    ).toBe("IA");
    expect(
      mapGrade12TechProCluster(
        "MARITIME",
        "Maritime Engineering at the Support Level",
      ),
    ).toBe("IA");
    expect(
      mapGrade12TechProCluster(
        "MARITIME",
        "Maritime Transportation at the Support Level",
      ),
    ).toBe("IA");
  });
});

describe("normalizeBowTerm", () => {
  it("normalizes English, Filipino, and one-term labels into canonical BowTerm values", () => {
    expect(normalizeBowTerm("First Term")).toBe("First Term");
    expect(
      normalizeBowTerm(
        "First Term: EFFECTIVE COMMUNICATION IN INTERPERSONAL CONTEXTS",
      ),
    ).toBe("First Term");
    expect(normalizeBowTerm("Unang Termino")).toBe("First Term");

    expect(normalizeBowTerm("Second Term")).toBe("Second Term");
    expect(
      normalizeBowTerm(
        "Second Term: EFFECTIVE COMMUNICATION IN ACADEMIC AND TRAINING CONTEXTS",
      ),
    ).toBe("Second Term");
    expect(normalizeBowTerm("Ikalawang Termino")).toBe("Second Term");

    expect(normalizeBowTerm("Third Term")).toBe("Third Term");
    expect(normalizeBowTerm("Ikatlong Termino")).toBe("Third Term");

    expect(normalizeBowTerm("Term")).toBe("One-Term");
    expect(normalizeBowTerm("Term Plan")).toBe("One-Term");
    expect(normalizeBowTerm("One-Term")).toBe("One-Term");
  });
});

describe("parseBowDocument — Grade 7", () => {
  it("parses Grade 7 ICT three-term layout with Suggested Activities across page breaks and Suggested Performance Tasks", () => {
    const text = [
      "              Page 1 of 2",
      "Last updated April 7, 2026",
      "\f                                TECHNOLOGY AND LIVELIHOOD EDUCATION",
      "                                                ICT",
      "                                              Grade 7",
      "",
      "                                         Three-Term Budget Of Work",
      "                                         For Learning Competencies",
      "",
      "                                                   First Term",
      "",
      "Performance Standard   The learners convert number systems in practical scenarios.",
      "",
      "  Content Standard        ●\u200b Demonstrate an understanding of ICT sectors.",
      "",
      "  Week                   Learning Competency                                      Suggested Activities",
      "",
      "           Information and Communications Technology                  ●\u200b ICT Sector Research Map",
      "              ●\u200b Analyze the various sectors of ICT and evaluate            ○\u200b Understanding ICT sectors",
      "                 the potential career and business prospects                   ■\u200b Create a visual map",
      "  1 to 3                                                                          showing key roles",
      "",
      "                                                                                                                 Page 1 of 2",
      "                                                                                                   Last updated April 7, 2026",
      "\fBudget of Work         Grade 7 | TLE: ICT",
      "",
      "                                                                                  and services.",
      "",
      "            Information and Communications Technology              ●\u200b ICT Trends News Hunt",
      "  4 to 7       ●\u200b Discuss the emerging trends and issues in ICT.         ○\u200b Identify current trends.",
      "",
      "                         ●\u200b Individual Performance Task - Binary Conversion",
      "                               ○\u200b Convert binary and hexadecimal numbers.",
      "     Suggested",
      "                         ●\u200b Group Task - Number System Game",
      " Performance Tasks",
      "                               ○\u200b Create a board game for conversions.",
      "",
      "                                                                                                                 Page 2 of 2",
    ].join("\n");

    const rows = parseBowDocument({
      relativePath: "Grade 7/[G7] TLE_ ICT.pdf",
      text,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      gradeLevels: [7],
      component: "ICT",
      sector: null,
      term: "First Term",
      weekRange: "1 to 3",
      learningCompetency:
        "Analyze the various sectors of ICT and evaluate the potential career and business prospects",
      contentStandard: "Demonstrate an understanding of ICT sectors.",
      performanceStandard:
        "The learners convert number systems in practical scenarios.",
      sourceDocument: "Grade 7/[G7] TLE_ ICT.pdf",
    });
    expect(rows[0]?.suggestedActivities).toContain("ICT Sector Research Map");
    expect(rows[0]?.suggestedActivities).toContain("and services.");
    expect(rows[0]?.suggestedPerformanceTasks).toContain(
      "Individual Performance Task - Binary Conversion",
    );
    expect(rows[0]?.suggestedPerformanceTasks).toContain(
      "Group Task - Number System Game",
    );

    expect(rows[1]).toMatchObject({
      weekRange: "4 to 7",
      learningCompetency: "Discuss the emerging trends and issues in ICT.",
    });
    expect(rows[1]?.suggestedActivities).toContain("ICT Trends News Hunt");
    expect(rows[1]?.suggestedPerformanceTasks).toContain(
      "Individual Performance Task - Binary Conversion",
    );
  });

  it("parses Grade 7 AFA / FCS / IA multi-component rows with multiple competencies per week", () => {
    const text = [
      "                                TECHNOLOGY AND LIVELIHOOD EDUCATION",
      "                                           AFA / FCS / IA",
      "                                              Grade 7",
      "",
      "                                                   First Term",
      "",
      "Performance Standard   The learners perform agricultural practices.",
      "",
      "  Content Standard        ●\u200b Demonstrate an understanding of agri-crops.",
      "",
      "  Week                    Learning Competency                                    Suggested Activities",
      "",
      "            Agriculture and Fishery Arts                             ●\u200b Agriculture Career Spotlight",
      "              ●\u200b Discuss career and business opportunities in             ●\u200b Explore careers in agriculture.",
      "                  agriculture",
      "    1         ●\u200b Differentiate agricultural tools, implements,",
      "                  and equipment.",
      "",
      "            Family and Consumer Science                              ●\u200b Hospitality Role Play",
      "    5         ●\u200b Discuss the fundamentals of hospitality industry.        ●\u200b Practice guest greeting.",
      "",
      "            Industrial Arts                                          ●\u200b Tool Identification",
      "    8         ●\u200b Discuss the services of Industrial Arts.                 ●\u200b Sort IA service cards.",
    ].join("\n");

    const rows = parseBowDocument({
      relativePath: "Grade 7/[G7] TLE_ AFA _ FCS _ IA.pdf",
      text,
    });

    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      gradeLevels: [7],
      component: "AFA",
      weekRange: "1",
      learningCompetency:
        "Discuss career and business opportunities in agriculture",
    });
    expect(rows[1]).toMatchObject({
      gradeLevels: [7],
      component: "AFA",
      weekRange: "1",
      learningCompetency:
        "Differentiate agricultural tools, implements, and equipment.",
    });
    expect(rows[2]).toMatchObject({
      gradeLevels: [7],
      component: "FCS",
      weekRange: "5",
      learningCompetency: "Discuss the fundamentals of hospitality industry.",
    });
    expect(rows[3]).toMatchObject({
      gradeLevels: [7],
      component: "IA",
      weekRange: "8",
      learningCompetency: "Discuss the services of Industrial Arts.",
    });
  });
});

describe("parseBowDocument — Grade 8 and Grade 9-10", () => {
  it("parses Grade 8 two-column AFA / FCS / IA layout", () => {
    const text = [
      "                        EDUKASYONG PANTAHANAN AT PANGKABUHAYAN",
      "                                     AFA / FCS / IA",
      "                                        Grade 8",
      "",
      "                                               First Term",
      "",
      "Week                                            Learning Competency",
      "",
      "       Agriculture and Fishery Arts",
      "         ●\u200b Discuss the background of aquaculture and its relation to fisheries.",
      " 1       ●\u200b Discuss career and business opportunities related to fisheries.",
      "",
      "       Family and Consumer Science",
      " 6       ●\u200b Discuss the principles of food preparation.",
    ].join("\n");

    const rows = parseBowDocument({
      relativePath: "Grade 8/[G8] TLE_ AFA _ FCS _ IA.pdf",
      text,
    });

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      gradeLevels: [8],
      component: "AFA",
      term: "First Term",
      weekRange: "1",
      learningCompetency:
        "Discuss the background of aquaculture and its relation to fisheries.",
      suggestedActivities: "",
      suggestedPerformanceTasks: "",
    });
    expect(rows[2]).toMatchObject({
      gradeLevels: [8],
      component: "FCS",
      term: "First Term",
      weekRange: "6",
      learningCompetency: "Discuss the principles of food preparation.",
    });
  });

  it("parses Grade 9-10 One-Term sector layout with Sector metadata and Suggested Activities", () => {
    const text = [
      "                                              TECHNOLOGY AND LIVELIHOOD EDUCATION",
      "                                                               ICT",
      "                                                      Grade 9 and Grade 10",
      "",
      "                                                                         Term",
      "",
      "            Sector                 Computer Programming",
      "",
      " Performance Standard              The learners develop website using HTML in a safe and responsible manner.",
      "",
      "     Content Standard              ●\u200b Demonstrate an understanding of HTML elements.",
      "",
      "     Week                             Learning Competency                                                 Suggested Activities",
      "",
      "                       ●\u200b Discuss the current trends in Computer                       ●\u200b Programming Jobs Around Us",
      "        1                 Programming.                                                      ○\u200b Identify current programming trends.",
      "                       ●\u200b Discuss computer ergonomics.",
    ].join("\n");

    const rows = parseBowDocument({
      relativePath: "Grade 9-10/[G9 _ G10] TLE_ ICT - Computer Programming .pdf",
      text,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      gradeLevels: [9, 10],
      component: "ICT",
      sector: "Computer Programming",
      term: "One-Term",
      weekRange: "1",
      learningCompetency: "Discuss the current trends in Computer Programming.",
      performanceStandard:
        "The learners develop website using HTML in a safe and responsible manner.",
    });
    expect(rows[0]?.suggestedActivities).toContain("Programming Jobs Around Us");
    expect(rows[1]).toMatchObject({
      gradeLevels: [9, 10],
      component: "ICT",
      sector: "Computer Programming",
      term: "One-Term",
      weekRange: "1",
      learningCompetency: "Discuss computer ergonomics.",
    });
  });
});

describe("parseBowDocument — Grade 11 (SHS Core English and Filipino)", () => {
  it("parses Grade 11 English subject with week numbers and domain content topics", () => {
    const text = [
      "                                       GENERAL MATHEMATICS",
      "                                             Grade 11",
      "",
      "                                                  First Term",
      "",
      "  Content Standard       The learners should have knowledge of business and finance.",
      "",
      "Performance Standard     Prepare accurate payrolls and digital payslips.",
      "",
      " Week                                               Learning Competency",
      "",
      "            Number and Algebra",
      "   1          ●\u200b Calculate weekly or monthly wages from an annual salary.",
      "              ●\u200b Solve problems involving salaries, wages, benefits, and deductions.",
    ].join("\n");

    const rows = parseBowDocument({
      relativePath: "Grade 11/[G11] General Mathematics.pdf",
      text,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      gradeLevels: [11],
      component: "SHS_CORE",
      sector: "General Mathematics",
      term: "First Term",
      weekRange: "1",
      contentTopic: "Number and Algebra",
      learningCompetency:
        "Calculate weekly or monthly wages from an annual salary.",
    });
  });

  it("parses Grade 11 Effective Communication iterative layout without Week column and stops before appendix", () => {
    const text = [
      "                                  EFFECTIVE COMMUNICATION",
      "                                          Grade 11",
      "",
      "               First Term: EFFECTIVE COMMUNICATION IN INTERPERSONAL CONTEXTS",
      "",
      "  Content Standard     The learners demonstrate effective communication.",
      "",
      "Performance Standard   The learners perform specific roles in communication events.",
      "",
      "                                                 Learning Competencies",
      "",
      "Interpreting meaning in spoken, written, and multimodal texts",
      "   ●\u200b Determine how language and tone are used purposefully.",
      "   ●\u200b Extract main points from spoken, written, and multimodal texts.",
      "",
      "Note: The Budget of Work (BoW) for Effective Communication is not organized by week.",
      "",
      "                                          QUARTERLY TO TRIMESTRAL MAPPING SUMMARY",
      "   ●\u200b Should not be parsed from appendix.",
    ].join("\n");

    const rows = parseBowDocument({
      relativePath: "Grade 11/[G11] Effective Communication.pdf",
      text,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      gradeLevels: [11],
      component: "SHS_CORE",
      sector: "Effective Communication",
      term: "First Term",
      weekRange: "",
      contentTopic:
        "Interpreting meaning in spoken, written, and multimodal texts",
      learningCompetency:
        "Determine how language and tone are used purposefully.",
    });
  });

  it("parses Grade 11 Filipino subject normalizing Unang/Ikalawang/Ikatlong Termino while preserving Filipino competency text", () => {
    const text = [
      "                     PAG-AARAL NG KASAYSAYAN AT LIPUNANG PILIPINO",
      "                                       Grade 11",
      "",
      "                                              Unang Termino",
      "",
      "    Pamantayang          Naipamamalas ang mapanuring pag-unawa sa kamalayang pangkasaysayan.",
      "    Pangnilalaman",
      "",
      "Pamantayan sa Pagganap   Nakapagsasagawa ng proyektong nagpapamalas ng kamalayang pangkasaysayan.",
      "",
      "  Linggo                                          Kasanayang Pampagkatuto",
      "",
      "  1 to 2       ●\u200b Natatalakay ang kahulugan at katuturan ng kamalayang pangkasaysayan.",
      "",
      "                                               Ikalawang Termino",
      "",
      "  Linggo                                          Kasanayang Pampagkatuto",
      "",
      "     1         ●\u200b Naipaliliwanag ang kahulugan at katuturan ng pakikibaka.",
      "",
      "                                                Ikatlong Termino",
      "",
      "  Linggo                                          Kasanayang Pampagkatuto",
      "",
      "     1         ●\u200b Natatalakay ang mga konseptong kaugnay ng likás-kayang pag-unlad.",
    ].join("\n");

    const rows = parseBowDocument({
      relativePath:
        "Grade 11/[G11] Pag-aaral ng Kasaysayan at Lipunang Pilipino.pdf",
      text,
    });

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      gradeLevels: [11],
      component: "SHS_CORE",
      sector: "Pag-aaral ng Kasaysayan at Lipunang Pilipino",
      term: "First Term",
      weekRange: "1 to 2",
      contentStandard:
        "Naipamamalas ang mapanuring pag-unawa sa kamalayang pangkasaysayan.",
      performanceStandard:
        "Nakapagsasagawa ng proyektong nagpapamalas ng kamalayang pangkasaysayan.",
      learningCompetency:
        "Natatalakay ang kahulugan at katuturan ng kamalayang pangkasaysayan.",
    });
    expect(rows[1]?.term).toBe("Second Term");
    expect(rows[1]?.learningCompetency).toBe(
      "Naipaliliwanag ang kahulugan at katuturan ng pakikibaka.",
    );
    expect(rows[2]?.term).toBe("Third Term");
    expect(rows[2]?.learningCompetency).toBe(
      "Natatalakay ang mga konseptong kaugnay ng likás-kayang pag-unlad.",
    );
  });
});

describe("parseBowDocument — Grade 12 (Tech-Pro)", () => {
  it("parses Grade 12 Tech-Pro One-Term elective with cluster description, component mapping, and flexible (*) weeks", () => {
    const text = [
      "                                                      TECHNICAL-PROFESSIONAL",
      "                                  ICT SUPPORT AND COMPUTER PROGRAMMING TECHNOLOGIES",
      "                                                                     Grade 12",
      "",
      "                                                                     Term Plan",
      "",
      "           Elective                Computer Programming (Java)",
      "",
      " Performance Standard              The learners perform procedures in setting up the IDE.",
      "",
      "     Content Standard              ●\u200b The learners demonstrate an understanding of Java programming.",
      "",
      "  Week                      Learning Competency                                    Suggested Activities",
      "",
      "                 ●\u200b Discuss the fundamental concepts of Java.         ●\u200b Java Concepts Quick Map",
      "    1                                                                       ○\u200b Identify key Java concepts.",
      "",
      "    *            ●\u200b Apply OOP principles in a Java program.",
      "",
      "                                  ●\u200b Individual Learning Activity : My Java Workspace Setup",
      "      Suggested                         ○\u200b Set up the Java IDE.",
      "  Performance Tasks",
      "",
      "* Teachers may assign learning competencies per week depending on the needs of the learners.",
    ].join("\n");

    const rows = parseBowDocument({
      relativePath: "Grade 12/[G12] Computer Programming (Java).pdf",
      text,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      gradeLevels: [12],
      component: "ICT",
      sector: "Computer Programming (Java)",
      sectorDescription: "ICT SUPPORT AND COMPUTER PROGRAMMING TECHNOLOGIES",
      term: "One-Term",
      weekRange: "1",
      learningCompetency: "Discuss the fundamental concepts of Java.",
    });
    expect(rows[0]?.suggestedActivities).toContain("Java Concepts Quick Map");
    expect(rows[0]?.suggestedPerformanceTasks).toContain(
      "My Java Workspace Setup",
    );
    expect(rows[1]).toMatchObject({
      gradeLevels: [12],
      component: "ICT",
      sector: "Computer Programming (Java)",
      term: "One-Term",
      weekRange: "*",
      learningCompetency: "Apply OOP principles in a Java program.",
    });
  });

  it("handles 3-column page shifts, multi-block performance tasks, and deeply indented level-3 bullet sub-items", () => {
    // 1. Deeply indented level-3 ● sub-bullets in Grade 11 Life and Career Skills
    const lcsText = [
      "                                          LIFE AND CAREER SKILLS",
      "                                                 Grade 11",
      "",
      "                                                   First Term",
      "",
      " Week                                                Learning Competency",
      "",
      "             Life Skills toward Personal and Social Development",
      " 1 to 2         ●\u200b Examine their own sense of self through understanding key developmental stages.",
      "                      ○\u200b Understanding and Strengthening the Self",
      "                             ■\u200b Physiological development",
      "                                   ●\u200b healthy habits",
      "                                   ●\u200b Collaboration",
    ].join("\n");

    const lcsRows = parseBowDocument({
      relativePath: "Grade 11/[G11] Life and Career Skills.pdf",
      text: lcsText,
    });
    expect(lcsRows).toHaveLength(1);
    expect(lcsRows[0]?.learningCompetency).toContain("Examine their own sense of self");
    expect(lcsRows[0]?.learningCompetency).toContain("healthy habits");

    // 2. 3-column activity shift left on page 2 + multi-block Performance Tasks
    const shiftedText = [
      "                                              TECHNOLOGY AND LIVELIHOOD EDUCATION",
      "                                                               ICT",
      "                                                      Grade 9 and Grade 10",
      "",
      "                                                                         Term",
      "",
      "            Sector                 Telecommunications",
      "",
      "     Week                             Learning Competency                                                 Suggested Activities",
      "",
      "                 ●\u200b Perform a call flow.                                        ●\u200b Flow It Right!",
      " 9 to 10                                                                              ○\u200b Demonstrate correct call flow.",
      "",
      "                                                                                                                 Page 1 of 2",
      "\fBudget of Work       Grade 9 / Grade 10 | TLE: ICT - Telecommunications",
      "",
      "                                                                ●\u200b Link & Navigate",
      "                                                                      ○\u200b Practice navigation.",
      "",
      "                         ●\u200b Individual Performance Task: Call Simulation",
      "                               ○\u200b Complete a simulated call.",
      "",
      "     Suggested           ●\u200b Group Performance Task: Contact Center Demo",
      " Performance Tasks             ○\u200b Present a team call flow.",
    ].join("\n");

    const shiftedRows = parseBowDocument({
      relativePath: "Grade 9-10/[G9 _ G10] TLE_ ICT - Telecommunications.pdf",
      text: shiftedText,
    });
    expect(shiftedRows).toHaveLength(1);
    expect(shiftedRows[0]?.learningCompetency).toBe("Perform a call flow.");
    expect(shiftedRows[0]?.suggestedActivities).toContain("Flow It Right!");
    expect(shiftedRows[0]?.suggestedActivities).toContain("Link & Navigate");
    expect(shiftedRows[0]?.suggestedPerformanceTasks).toContain(
      "Individual Performance Task: Call Simulation",
    );
    expect(shiftedRows[0]?.suggestedPerformanceTasks).toContain(
      "Group Performance Task: Contact Center Demo",
    );
  });
});

describe("mergeBowIntoCatalog", () => {
  const baseCg: CurriculumCompetency[] = [
    {
      id: "cg-g7-ict-q1-01",
      source: "built-in",
      gradeLevels: [7],
      quarters: [1],
      quarterLabel: "Quarter I",
      component: "ICT",
      sector: null,
      sectorDescription: null,
      contentTopic: "Sectors of ICT",
      contentSubTopics: [],
      contentStandard: "CS",
      performanceStandard: "PS",
      competencyNumber: 1,
      learningCompetency:
        "analyze the various sectors of ICT and evaluate the potential career and business prospects relevant to their future career choices",
      customNotes: "Keep teacher note",
    },
    {
      id: "cg-g9-10-fcs-handicrafts-01",
      source: "built-in",
      gradeLevels: [9, 10],
      quarters: [1, 2, 3, 4],
      quarterLabel: "Quarter I-IV",
      component: "FCS",
      sector: "HANDICRAFTS",
      sectorDescription: null,
      contentTopic: "Handicraft",
      contentSubTopics: [],
      contentStandard: "CS",
      performanceStandard: "PS",
      competencyNumber: 1,
      learningCompetency: "discuss the principles of handicraft production",
    },
    {
      id: "custom-teacher-01",
      source: "custom",
      gradeLevels: [8],
      quarters: [1],
      quarterLabel: "Quarter I",
      component: "ICT",
      sector: null,
      sectorDescription: null,
      contentTopic: "Custom Topic",
      contentSubTopics: [],
      contentStandard: "Custom CS",
      performanceStandard: "Custom PS",
      competencyNumber: null,
      learningCompetency: "Teacher custom competency",
    },
  ];

  const sampleRows: ParsedBowRow[] = [
    {
      gradeLevels: [7],
      component: "ICT",
      sector: null,
      sectorDescription: null,
      term: "First Term",
      weekRange: "1 to 3",
      contentTopic: "ICT",
      contentStandard: "CS",
      performanceStandard: "PS",
      learningCompetency:
        "Analyze the various sectors of ICT and evaluate the potential career and business prospects relevant to their future career choices.",
      suggestedActivities: "- ICT Sector Research Map",
      suggestedPerformanceTasks: "- Binary Conversion Challenge",
      sourceDocument: "Grade 7/[G7] TLE_ ICT.pdf",
    },
    {
      gradeLevels: [9, 10],
      component: "FCS",
      sector: "Handicraft",
      sectorDescription: null,
      term: "One-Term",
      weekRange: "1",
      contentTopic: "Handicraft",
      contentStandard: "CS",
      performanceStandard: "PS",
      learningCompetency: "Discuss the principles of handicraft production.",
      suggestedActivities: "",
      suggestedPerformanceTasks: "",
      sourceDocument: "Grade 9-10/[G9 _ G10] TLE_ FCS - Handicraft.pdf",
    },
    {
      gradeLevels: [7],
      component: "ICT",
      sector: null,
      sectorDescription: null,
      term: "Third Term",
      weekRange: "9",
      contentTopic: "ICT",
      contentStandard: "CS",
      performanceStandard: "PS",
      learningCompetency: "Unmatched Grade 7 BoW competency.",
      suggestedActivities: "- Extra Activity",
      suggestedPerformanceTasks: "",
      sourceDocument: "Grade 7/[G7] TLE_ ICT.pdf",
    },
    {
      gradeLevels: [11],
      component: "SHS_CORE",
      sector: "General Mathematics",
      sectorDescription: null,
      term: "First Term",
      weekRange: "1",
      contentTopic: "Number and Algebra",
      contentStandard: "CS",
      performanceStandard: "PS",
      learningCompetency: "Calculate weekly or monthly wages.",
      suggestedActivities: "",
      suggestedPerformanceTasks: "",
      sourceDocument: "Grade 11/[G11] General Mathematics.pdf",
    },
    {
      gradeLevels: [12],
      component: "ICT",
      sector: "Computer Programming (Java)",
      sectorDescription: "ICT SUPPORT AND COMPUTER PROGRAMMING TECHNOLOGIES",
      term: "One-Term",
      weekRange: "1",
      contentTopic: "Computer Programming (Java)",
      contentStandard: "CS",
      performanceStandard: "PS",
      learningCompetency: "Discuss the fundamental concepts of Java.",
      suggestedActivities: "- Java Concepts Quick Map",
      suggestedPerformanceTasks: "- My Java Workspace Setup",
      sourceDocument: "Grade 12/[G12] Computer Programming (Java).pdf",
    },
  ];

  it("enriches matching CG competencies in place, adds unmatched and Grade 11-12 rows as standalone, preserves custom items/notes, and is idempotent", () => {
    const firstPass = mergeBowIntoCatalog(baseCg, sampleRows);

    expect(firstPass.stats.matchedCgCount).toBe(2);
    expect(firstPass.stats.standaloneAddedCount).toBe(3);
    expect(firstPass.catalog).toHaveLength(6);

    const enrichedG7 = firstPass.catalog.find((c) => c.id === "cg-g7-ict-q1-01");
    expect(enrichedG7?.customNotes).toBe("Keep teacher note");
    expect(enrichedG7?.budgetOfWork).toEqual({
      term: "First Term",
      weekRange: "1 to 3",
      suggestedActivities: "- ICT Sector Research Map",
      suggestedPerformanceTasks: "- Binary Conversion Challenge",
      sourceDocument: "Grade 7/[G7] TLE_ ICT.pdf",
    });

    // Handicraft vs HANDICRAFTS matched despite singular/plural & case difference
    const enrichedG910 = firstPass.catalog.find(
      (c) => c.id === "cg-g9-10-fcs-handicrafts-01",
    );
    expect(enrichedG910?.budgetOfWork).toMatchObject({
      term: "One-Term",
      weekRange: "1",
      sourceDocument: "Grade 9-10/[G9 _ G10] TLE_ FCS - Handicraft.pdf",
    });

    // Custom competency preserved
    expect(
      firstPass.catalog.find((c) => c.id === "custom-teacher-01"),
    ).toBeDefined();

    // Grade 11 & 12 standalone items added with bow- IDs
    const g11 = firstPass.catalog.find((c) => c.gradeLevels.includes(11));
    expect(g11).toMatchObject({
      source: "built-in",
      component: "SHS_CORE",
      sector: "General Mathematics",
      budgetOfWork: { term: "First Term", weekRange: "1" },
    });
    expect(g11?.id.startsWith("bow-g11-")).toBe(true);

    const g12 = firstPass.catalog.find((c) => c.gradeLevels.includes(12));
    expect(g12).toMatchObject({
      source: "built-in",
      component: "ICT",
      sector: "Computer Programming (Java)",
      sectorDescription: "ICT SUPPORT AND COMPUTER PROGRAMMING TECHNOLOGIES",
      budgetOfWork: { term: "One-Term", weekRange: "1" },
    });
    expect(g12?.id.startsWith("bow-g12-")).toBe(true);

    // Idempotency: running a second time produces identical output!
    const secondPass = mergeBowIntoCatalog(firstPass.catalog, sampleRows);
    expect(secondPass.catalog).toEqual(firstPass.catalog);
    expect(secondPass.stats).toEqual(firstPass.stats);
  });
});
