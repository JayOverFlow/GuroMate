# GuroMate

GuroMate is a personal instructional planning and classroom management system for Philippine pre-service TLE teachers (Grades 7–12) built around the DepEd MATATAG curriculum and the ILAW lesson design framework.

## Language

### Lesson Design (ILAW Framework)

**ILAW Framework**:
The DepEd Order No. 016, s. 2026 four-part lesson design structure consisting of **Intentions**, **Learning Experience**, **Assessing Learning**, and **Ways Forward**.
_Avoid_: 4As, 5Es, DepEd DO 42 standard format

**Learning Design Principles**:
The seven DepEd Order No. 016, s. 2026 pedagogical principles guiding **Learning Experience**—clarifying objectives, guiding before independent practice, checking well-being and mastery, connecting to prior competencies, encouraging collaboration, reflecting on relevance, and ensuring inclusion.
_Avoid_: Teaching tips, 4As, 5Es

**Daily Lesson Log (DLL)**:
A multi-session (typically 5-session) weekly lesson plan organized as a grid where **Intentions** span the whole log and each **Session** has its own column for **Learning Objectives**, **Learning Experience**, **Assessing Learning**, and **Ways Forward**. A single DLL may target one or more **Learning Competencies** across one or more **TLE Components** assigned to specific **Sessions** (e.g., Sessions 1–2 for ICT and Sessions 3–5 for FCS).
_Avoid_: Weekly plan, lesson outline

**Daily Lesson Plan (DLP)**:
A detailed single-session lesson plan (created from scratch or derived from one **Session** of a **Daily Lesson Log**) that splits **Learning Experience**, **Assessing Learning**, and **Ways Forward** into **Teacher's Activity** and **Student's Activity** columns.
_Avoid_: Detailed lesson plan, lesson script

**Lesson Library**:
The unified workspace listing saved **Daily Lesson Logs (DLLs)** and **Daily Lesson Plans (DLPs)** with their derivation lineage across **Sessions**.
_Avoid_: Saved lessons, my plans, lesson dashboard

**Session**:
A single instructional period or day within a **Daily Lesson Log** (e.g., Session 1 through Session 5).
_Avoid_: Day, period, class meeting

**Intentions**:
The first ILAW section, capturing the target **Learning Competency**, **Content Standard**, **Performance Standard**, per-session **Learning Objectives**, and **Learner Context**.
_Avoid_: Objectives section, learning targets

**Learning Experience**:
The second ILAW section, detailing the instructional journey across four sub-parts: **Pre-Lesson**, **Lesson Flow**, **Learning Resources**, and **Opportunities for Integration and Contextualization**.
_Avoid_: Procedure, lesson proper

**Assessing Learning**:
The third ILAW section, containing the **Formative Assessment** tasks, questions, feedback mechanisms, and learner accommodations for the session.
_Avoid_: Evaluation, exam

**Ways Forward**:
The fourth ILAW section, comprising **Extended Learning Opportunities** outside class hours and teacher **Reflections**.
_Avoid_: Assignment, homework, remarks

**Learner Context**:
The teacher's manually written observations of learners' recent performance, strengths, interests, and barriers to learning; left blank in generated documents for manual completion.
_Avoid_: Student profile, class background

**Lesson Blueprint**:
An AI-drafted, teacher-editable planning proposal generated before full document creation that unpacks session progression, **Learning Objectives**, selectable **Learning Experience** activity options, and selectable **Formative Assessment** options with recommended choices pre-selected.
_Avoid_: Lesson outline, draft plan, syllabus

**Classroom Context**:
Structured practical teaching constraints—such as period length (e.g., 45 minutes, 60 minutes, 90 minutes, 2 hours), available lab or shop facilities, and delivery modality—used to pace activities and choose realistic resources without populating **Learner Context**.
_Avoid_: Learner context, class profile, prompt notes

**Prompt Notes**:
Optional free-text teacher instructions beyond structured **Classroom Context** (such as custom scenarios, local examples, or specific activity constraints) passed to the AI during generation and excluded from the exported document's **Learner Context** cell.
_Avoid_: Learner context, classroom context, system prompt

**System Instructions**:
Built-in DepEd MATATAG and **ILAW Framework** pedagogical and formatting directives sent via the AI provider's native system role during **Daily Lesson Log (DLL)** or **Daily Lesson Plan (DLP)** generation; distinct from per-lesson teacher **Prompt Notes**.
_Avoid_: Prompt notes, user prompt, custom notes

**Reflections**:
The teacher's manually written post-session notes on instructional adjustments, learner interests, and coaching points under **Ways Forward**; left blank in generated documents for manual completion.
_Avoid_: Remarks, post-lesson notes

**Declaration of AI Use**:
The DepEd Order No. 003, s. 2026 Annex A statement in a **Daily Lesson Log (DLL)** or **Daily Lesson Plan (DLP)** disclosing the AI tool used, its auxiliary drafting role, teacher review and validation, and confirmation that no confidential learner data was shared.
_Avoid_: AI disclaimer, AI note, footnote

**Reference Material**:
Optional teacher-supplied subject-matter content (such as excerpts from a DepEd Lesson Exemplar, Learning Activity Sheet, Learner's Material, or TESDA Training Regulation) used to ground a **Daily Lesson Log (DLL)** or **Daily Lesson Plan (DLP)** in accurate technical facts and procedures.
_Avoid_: Attachment, textbook upload, RAG source

### Curriculum

**Curriculum Guide (CG)**:
The official DepEd MATATAG TLE curriculum specification for Grades 7–10 defining **TLE Components**, **Sectors**, **Content**, **Content Standards**, **Performance Standards**, and **Learning Competencies**.
_Avoid_: Syllabus, course outline

**Budget of Work (BoW)**:
A DepEd pacing document for Grades 7–12 that maps **Learning Competencies** across terms (three-term or one-term) and weeks alongside **Suggested Activities** and **Suggested Performance Tasks**.
_Avoid_: Pacing guide, schedule

**TLE Component**:
One of the four major branches of Technology and Livelihood Education (and Grade 12 Technical-Professional electives): **Information and Communications Technology (ICT)**, **Agriculture and Fishery Arts (AFA)**, **Family and Consumer Science (FCS)**, and **Industrial Arts (IA)**.
_Avoid_: Subject, strand, track

**SHS Core**:
The Senior High School (Grade 11) general education core curriculum classification alongside the four **TLE Components**, covering core subjects such as Effective Communication, General Mathematics, General Science, Life and Career Skills, Mabisang Komunikasyon, and Pag-aaral ng Kasaysayan at Lipunang Pilipino.
_Avoid_: General education, non-TLE, academic track

**Sector**:
A specialized industry cluster, Grade 12 Technical-Professional elective, or **SHS Core** subject within a component (e.g., Computer Programming, Computer Systems Servicing, Animation under ICT; Animal Production, Aquaculture under AFA; Hospitality and Tourism electives under FCS; Construction, Industrial, or Maritime electives under IA; General Mathematics under SHS Core).
_Avoid_: Major, elective

**Learning Competency**:
A curriculum-mandated knowledge, skill, or attitude from the **Curriculum Guide** or **Budget of Work** targeted across one or more **Sessions**.
_Avoid_: Skill, outcome

**Learning Objective**:
A smaller, session-specific knowledge, skill, or task unpacked from a **Learning Competency** that learners demonstrate by the end of a **Session**.
_Avoid_: Sub-competency, daily goal

### Assessment & Classroom Management

**Quiz**:
A printable formative assessment document (with an accompanying answer key) aligned to a **Daily Lesson Log**, **Daily Lesson Plan**, or **Learning Competency**.
_Avoid_: Exam, test portal, summative test

**Class Section**:
A named student group (grade level, section name, and student roster) used in lesson header metadata and classroom management tools (**Random Student Picker**, **Group Maker**).
_Avoid_: Classroom, cohort, batch

**Random Student Picker**:
A classroom recitation tool that draws a present student uniformly at random from the active **Class Section**'s **Recitation Pool**.
_Avoid_: Name wheel, roulette, student selector

**Recitation Pool**:
The subset of present students in a **Class Section** who remain eligible to be drawn by the **Random Student Picker** until the pool is reset.
_Avoid_: Active roster, draw list, queue

**Group Maker**:
A classroom activity tool that partitions present students in the active **Class Section** evenly into randomized groups by target group count or maximum group size, with optional manual swaps.
_Avoid_: Team generator, group splitter, seating chart

**Classroom Timer**:
A persistent countdown timer (presets and custom duration) shared across workspaces and available in **Projector View**, with an optional chime gated by sound and reduced-motion preferences.
_Avoid_: Stopwatch, alarm clock

**Projector View**:
A distraction-free fullscreen presentation mode for classroom management tools (**Random Student Picker**, **Group Maker**, and **Classroom Timer**) sized for whole-class visibility.
_Avoid_: Presentation mode, kiosk mode, TV mode
