# Two-Step Lesson Blueprint Approval and Lightweight Reference Grounding

We split **Daily Lesson Log (DLL)** and **Daily Lesson Plan (DLP)** creation into two interactive steps—`Plan Lesson` (generating an editable **Lesson Blueprint** with pre-selected `(Recommended)` activity and **Formative Assessment** options) followed by `Approve & Generate` (locking the teacher's approved choices into full **ILAW Framework** generation)—rather than generating full lessons in one black-box AI call. This directly satisfies **DepEd Order No. 016, s. 2026** and **DepEd Order No. 003, s. 2026** expectations of teacher agency and human pedagogical review, prevents repetitive multi-**Session** unpacking and mismatched assessments, locks derived **DLPs** to their parent **DLL** **Session**, and keeps pre-service teachers free from blank-page friction via sensible `(Recommended)` defaults.

To ground technical TLE and **SHS Core** content without hallucination, we pair the CLI-compiled **Curriculum Guide** and **Budget of Work** catalog ([ADR-0003](./0003-grade-7-12-bow-ingestion-and-component-mapping.md)) with optional per-lesson **Reference Material** (pasted excerpts or on-the-fly plain-text extraction from a local `.txt`, `.docx`, or `.pdf` file bounded to a prompt-safe character limit) and structured **Classroom Context**—rather than adding a vector database, embedding pipeline, or bundled DepEd textbooks. This preserves GuroMate's zero-database, local-first architecture ([ADR-0001](./0001-vite-middleware-local-disk-storage.md)) and avoids redistributing gated DepEd materials while giving teachers immediate factual grounding.

## Considered Options

- **One-click black-box generation**: Rejected because a single prompt unpacking multi-**Session** competencies, choosing activities, designing assessments, and writing full ILAW prose simultaneously drifts in constructive alignment, repeats depth across **Sessions**, and leaves core instructional decisions unreviewed in tension with DO 016 and DO 003.
- **Manual blank-form planning before AI drafting**: Rejected because pre-service teachers need rapid scaffolding; proposing a complete **Lesson Blueprint** with pre-selected `(Recommended)` picks keeps teacher control with one-click approval.
- **Vector database / RAG indexing over bundled textbooks or Lesson Exemplars**: Rejected because it introduces heavy runtime and storage infrastructure contradicting [ADR-0001](./0001-vite-middleware-local-disk-storage.md) and [ADR-0003](./0003-grade-7-12-bow-ingestion-and-component-mapping.md), cannot legally bundle gated DepEd LR-Portal PDFs, and is unnecessary when a single lesson only needs a bounded plain-text excerpt.
- **Multi-agent LLM critic loop after generation**: Rejected in favor of a fast deterministic local alignment check with at most one automatic repair retry for missing or malformed required structural fields, avoiding extra latency and API cost.

## Consequences

- Planning adds `POST /api/dlls/plan` and `POST /api/dlps/plan` alongside backward-compatible `POST /api/dlls/generate` and `POST /api/dlps/generate`, locking Step 2 strictly to the approved **Lesson Blueprint** whenever supplied.
- Local **Reference Material** extraction caps extracted text to a prompt-safe length; image-only scanned PDFs fall back to manual excerpt pasting rather than adding OCR dependencies.
