# GuroMate

GuroMate is a personal instructional planning and classroom management system for Philippine pre-service TLE teachers (Grades 7–10) built around the DepEd MATATAG curriculum and the ILAW lesson design framework.

## Language

### Lesson Design (ILAW Framework)

**ILAW Framework**:
The four-part lesson design structure consisting of **Intentions**, **Learning Experience**, **Assessing Learning**, and **Ways Forward**.
_Avoid_: 4As, 5Es, DepEd DO 42 standard format

**Daily Lesson Log (DLL)**:
A multi-session (typically 5-session) weekly lesson plan organized as a grid where **Intentions** span the whole log and each **Session** has its own column for **Learning Objectives**, **Learning Experience**, **Assessing Learning**, and **Ways Forward**. A single DLL may target one or more **Learning Competencies** across one or more **TLE Components** assigned to specific **Sessions** (e.g., Sessions 1–2 for ICT and Sessions 3–5 for FCS).
_Avoid_: Weekly plan, lesson outline

**Daily Lesson Plan (DLP)**:
A detailed single-session lesson plan (created from scratch or derived from one **Session** of a **Daily Lesson Log**) that splits **Learning Experience**, **Assessing Learning**, and **Ways Forward** into **Teacher's Activity** and **Student's Activity** columns.
_Avoid_: Detailed lesson plan, lesson script

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

**Prompt Notes**:
Optional teacher instructions (e.g., period duration, available lab/shop equipment, activity constraints) passed to the AI during generation and excluded from the exported document's **Learner Context** cell.
_Avoid_: Learner context, system prompt

**System Instructions**:
Built-in DepEd MATATAG and **ILAW Framework** pedagogical and formatting directives sent via the AI provider's native system role during **Daily Lesson Log (DLL)** or **Daily Lesson Plan (DLP)** generation; distinct from per-lesson teacher **Prompt Notes**.
_Avoid_: Prompt notes, user prompt, custom notes

**Reflections**:
The teacher's manually written post-session notes on instructional adjustments, learner interests, and coaching points under **Ways Forward**; left blank in generated documents for manual completion.
_Avoid_: Remarks, post-lesson notes

### Curriculum

**Curriculum Guide (CG)**:
The official DepEd MATATAG TLE curriculum specification for Grades 7–10 defining **TLE Components**, **Sectors**, **Content**, **Content Standards**, **Performance Standards**, and **Learning Competencies**.
_Avoid_: Syllabus, course outline

**Budget of Work (BoW)**:
A DepEd pacing document that maps **Learning Competencies** across terms and weeks alongside **Suggested Activities** and **Suggested Performance Tasks**.
_Avoid_: Pacing guide, schedule

**TLE Component**:
One of the four major branches of Technology and Livelihood Education: **Information and Communications Technology (ICT)**, **Agriculture and Fishery Arts (AFA)**, **Family and Consumer Science (FCS)**, and **Industrial Arts (IA)**.
_Avoid_: Subject, strand, track

**Sector**:
A specialized industry cluster within a **TLE Component** taken in Grades 9 and 10 (e.g., Computer Programming, Computer Systems Servicing, Visual Arts, Telecommunications under ICT; Animal Production, Aquaculture, Crop Production, Fish Capture, Food Processing under AFA; etc.).
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
