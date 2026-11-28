# DepEd DO 016, s. 2026 Lesson Planning Reference Standard

This document is GuroMate's pedagogical source of truth for **Daily Lesson Log (DLL)** and **Daily Lesson Plan (DLP)** planning, generation, validation, and `.docx` export across Grades 7–12 (**TLE Components** and **SHS Core**).

> **Retired Legacy Examples**: Author-created legacy files (`DLL_example.docx`, `DLP_example.docx`) are retired and are **not** authoritative pedagogical references. All rules below derive from verified DepEd policies and the official institutional ILAW templates ([DLL_ILAW_template.docx](../DLL_ILAW_template.docx), [DLP_ILAW_template.docx](../DLP_ILAW_template.docx)).

## 1. Authoritative DepEd Policy Anchors

- **DepEd Order No. 016, s. 2026** (*Guidelines on Lesson Planning and Learning Design*): Establishes the four-part **ILAW Framework** (**Intentions**, **Learning Experience**, **Assessing Learning**, **Ways Forward**) and the seven **Learning Design Principles**. Affirms teacher agency over instructional decisions—AI is an auxiliary aid and never replaces teacher review and approval.
- **MATATAG Instructional Design Framework (IDF)** (*DO 010, s. 2024*): Guides instructional flow through the **4Is** (*Inclusive, Ideational, Integrative, Innovative*), **4Cs** (*Context, Connection, Collaboration, Creativity*), and **4Es** (*Engage, Explore, Experience, Empathize*).
- **DepEd Order No. 8, s. 2015** (*Policy Guidelines on Classroom Assessment*): Establishes ongoing formative assessment as an integral part of instruction to monitor mastery, give timely feedback, and adjust teaching using varied formats aligned to **Learning Objectives**—not a fixed multiple-choice quiz default.
- **DepEd Order No. 003, s. 2026 Annex A** (*Foundational Guidelines on AI in Basic Education — Declaration of AI Use*): Requires every AI-assisted **Daily Lesson Log (DLL)** and **Daily Lesson Plan (DLP)** to disclose the active AI tool/model, its auxiliary drafting role under teacher direction, teacher review and validation against DepEd standards, and confirmation that no confidential learner data was shared (Data Privacy Act of 2012).

## 2. Three-Layer Reference Stack (How a DepEd Teacher Plans)

GuroMate mirrors how a DepEd teacher prepares lessons by separating curriculum authority, technical content, and classroom constraints into three lightweight layers:

1. **Curriculum Backbone (Built-In Catalog)**: Official **Curriculum Guide (CG)** and **Budget of Work (BoW)** PDFs compiled via CLI into `src/engine/curriculumCatalog.json` (see [ADR-0003](./adr/0003-grade-7-12-bow-ingestion-and-component-mapping.md)). Supplies **Learning Competencies**, **Content Standards**, **Performance Standards**, term/week placement, **Suggested Activities**, and **Suggested Performance Tasks**. Answers *what* to teach and *when*.
2. **Optional Reference Material**: Teacher-supplied subject-matter content—pasted excerpts or plain text extracted locally from a `.txt`, `.docx`, or `.pdf` file (e.g., DepEd Lesson Exemplar, Learning Activity Sheet, Learner's Material, or TESDA Training Regulation)—combined with per-competency notes. Grounds technical facts, tools, worked examples, and OHS/PPE safety practices without external indexing infrastructure.
3. **Structured Classroom Context & Prompt Notes**:
   - **Classroom Context**: Structured constraints covering period length (`45 min`, `60 min`, `90 min`, `120 min` / `2 hrs`, or custom minutes), available facility/equipment (e.g., Computer Lab, Shop/Workshop, Standard Classroom), and delivery modality (e.g., Face-to-Face, Blended).
   - **Prompt Notes**: Optional free-text teacher directives for localized scenarios or specific constraints beyond **Classroom Context**.
   - **Strict Separation**: **Classroom Context** and **Prompt Notes** guide AI pacing and realism and are **never** copied into **Learner Context** or **Reflections**.

## 3. Two-Step Interactive Planning Workflow

To honor DO 016 / DO 003 teacher agency without blank-page friction (see [ADR-0004](./adr/0004-two-step-lesson-blueprint-and-reference-grounding.md)):

1. **Step 1 — `Plan Lesson` → Lesson Blueprint**: AI drafts an editable **Lesson Blueprint** proposing per-**Session** progression, 3 SMART **Learning Objectives**, 2–3 concrete **Learning Experience** activity options (adapting BoW **Suggested Activities** when present and proposing authentic MATATAG/TLE alternatives when blank) with `(Recommended)` pre-selected, and 5 **Formative Assessment** types—**Exit Ticket**, **Observation / Skill Checklist**, **Performance / Demo Rubric**, **Activity Worksheet**, and **Short Quiz**—with `(Recommended)` pre-selected and a 1-line preview.
2. **Step 2 — `Approve & Generate`**: The teacher edits **Learning Objectives**, keeps or swaps activity and assessment choices in one click (or clicks `Re-plan`), and locks those decisions into full **DLL** or **DLP** generation.

## 4. ILAW Framework & Seven Learning Design Principles

Every generated **DLL** and **DLP** obeys the four **ILAW Framework** sections and the exact prompts printed inside the official institutional templates:

| ILAW Section | Required Elements & Template Rules |
| --- | --- |
| **Intentions** | Target **Learning Competency**, **Content Standard**, **Performance Standard**, per-**Session** **Learning Objectives**, and **Learner Context** (left strictly blank on generation and `.docx` export for manual teacher observations). |
| **Learning Experience** | **Pre-Lesson** (readiness, motivation hook, prior-knowledge activation, objective sharing); **Lesson Flow** (coherent sequence weaving relevant MATATAG IDF 4Is/4Cs/4Es and the seven **Learning Design Principles**); **Learning Resources** (available, inclusive primary resources **plus** emergency/offline alternatives such as print/chalkboard/no-power backups); **Opportunities for Integration and Contextualization** (meaningful Philippine, cross-disciplinary, or technology link, or `N/A`). |
| **Assessing Learning** | **Formative Assessment** directly aligned to every **Learning Objective**, using the approved assessment format, ongoing teacher feedback, explicit ways for learners to ask for guidance or support during the **Session**, and appropriate learner accommodations (e.g., varied response formats, small-group options, visual/auditory supports). |
| **Ways Forward** | **Extended Learning Opportunities** (practical out-of-class reinforcement, curiosity, or support, drawing on BoW **Suggested Performance Tasks** where fitting) and **Reflections** (left strictly blank on generation and `.docx` export for manual post-**Session** teacher notes). |

### The Seven Learning Design Principles (DO 016, s. 2026)

Apply the principles that fit each **Session** naturally (not all seven are mandatory in every **Session**):

1. Make the objectives clear for the learners.
2. Guide learners before letting them try the task on their own.
3. Check the state of the learners' well-being, understanding, and mastery over the lesson.
4. Connect today's new concepts to past competencies.
5. Encourage collaboration among learners.
6. Invite learners to reflect on why this matters to them.
7. Ensure inclusion for learners' varied abilities, learning styles, and contexts.

## 5. DLL and DLP Quality Bar

### Shared Standards

- **Learning Objectives (3-Bullet SMART Rule)**: Every instructional **Session** has exactly 3 bulleted (`• `) SMART **Learning Objectives** ordered Cognitive → Psychomotor → Affective with measurable criteria and **no** domain-label prefixes (omit `Cognitive:`, `Psychomotor:`, `Affective:`).
- **Constructive Alignment**: Every **Learning Objective** must be explicitly taught in **Learning Experience** and directly measured in **Formative Assessment**.
- **Declaration of AI Use (DO 003, s. 2026 Annex A)**: Auto-populated and editable per lesson, naming the active AI tool/model, its auxiliary drafting role under teacher direction, teacher review and validation against DepEd standards, and confirmation that no confidential learner data was shared; injected into Table 0 Row 7 on `.docx` export (see [ADR-0002](./adr/0002-template-xml-injection-for-ilaw-docx.md)).
- **Deterministic Alignment Check**: A zero-LLM local check validates required structural fields, 3-bullet objectives, emergency/offline resource alternatives, assessment feedback/accommodations, **DLP** time totals, and derived **DLP** fidelity. At most **one** automatic repair retry runs when required structural fields are missing or malformed; soft checks surface inline for teacher review.

### Daily Lesson Log (DLL) Specifics

- **Progressive Multi-Session Unpacking**: When one **Learning Competency** spans multiple **Sessions**, scaffold difficulty progressively across **Sessions** (e.g., foundational concepts → guided practice → hands-on application → performance/synthesis) so consecutive **Sessions** never repeat the same depth.
- **BoW Adaptation & Graceful Fallback**: Actively adapt BoW **Suggested Activities** and **Suggested Performance Tasks** when present; when a BoW entry leaves those columns empty, design authentic MATATAG TLE or **SHS Core** tasks fitted to **Classroom Context**.

### Daily Lesson Plan (DLP) Specifics (Pre-Service Classroom-Ready Standard)

- **Strict Derivation Fidelity**: A **DLP** derived from a saved **DLL** **Session** locks strictly to the parent **Session**'s **Learning Objectives**, chosen activity, chosen **Formative Assessment** type, and key resources.
- **Period-Matched Pacing**: Provide explicit minute-by-minute time budgets across **Pre-Lesson**, **Lesson Flow**, and **Assessing Learning** that sum cleanly to the **Classroom Context** period length (including 90-minute and 120-minute / 2-hour shop or lab blocks).
- **Classroom-Ready Paired Delivery** (**Teacher's Activity** / **Student's Activity**):
  - **Pre-Lesson**: Philippine classroom opening routine (greeting, prayer, attendance), learner well-being check, motivation hook with guide question, and verbatim sharing of the 3 **Learning Objectives**.
  - **Lesson Flow**: Concrete key teaching points grounded in the **Curriculum Guide**, **Budget of Work**, and optional **Reference Material**; teacher guide questions paired with expected student responses; step-by-step guided and hands-on tasks with explicit OHS/PPE safety checks where applicable; share-back, feedback, and synthesis.
  - **Assessing Learning**: Ready-to-use **Formative Assessment** items, prompts, or rubric criteria paired with an answer key or scoring criteria, explicit help-seeking/feedback channels, and learner accommodations.

## 6. Curriculum Archive Gaps & Follow-Up Checklist

The items below reflect missing gated DepEd PDFs in the local archive (`Budget of Works/`). They do **not** block planning, generation, or validation—teachers can ground any affected **Sector** immediately using **Reference Material**:

- [ ] **Grade 12 Technical-Professional AFA Budgets of Work (BoWs)**: `Budget of Works/Grade 12/` currently holds 31 PDFs across **ICT** (7), **FCS** (11), and **IA** (13), and **0 AFA** PDFs. Source official Grade 12 Tech-Pro **AFA** BoW PDFs (e.g., Agricultural Crop Production, Animal Production, Aquaculture / Fishery Arts, Food Processing, Organic Agriculture) and drop them into `Budget of Works/Grade 12/` for CLI ingestion.
- [ ] **Grade 11–12 Curriculum Guides (CGs)**: Only the Grades 7–10 MATATAG TLE **Curriculum Guide** (`Curriculum_Guide.pdf`) is currently archived. Grade 11 **SHS Core** (6 PDFs) and Grade 12 Technical-Professional (31 PDFs) records are BoW-sourced only; three Grade 12 **ICT** BoW PDFs (`Computer Programming (.Net Technology)`, `Computer Programming (Oracle Database)`, `Contact Center Services`) omit **Content Standards** and **Performance Standards** in the source files and will require official Grade 11–12 CGs when publicly released.
