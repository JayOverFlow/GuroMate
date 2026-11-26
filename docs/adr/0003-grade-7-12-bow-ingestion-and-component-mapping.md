# Static CLI Ingestion and Component Mapping for Grade 7–12 Budgets of Work

We ingest all Grade 7–12 Budget of Work (BoW) PDFs from `./Budget of Works` via a repeatable build-time CLI script into `src/engine/curriculumCatalog.json` rather than parsing PDFs at runtime inside the Vite middleware server. This keeps the local app fast and avoids runtime PDF-extraction dependencies while letting teachers refresh the built-in catalog whenever new DepEd PDFs are added.

To preserve GuroMate's unified filtering and lesson-generation model across Grades 7–12, we map the 9 Grade 12 Technical-Professional (Tech-Pro) clusters onto the existing four **TLE Components** (`ICT`, `AFA`, `FCS`, `IA`) — storing the elective name in `sector` and the Tech-Pro cluster in `sectorDescription` — and add a single fifth component (`SHS_CORE`, displayed as **SHS Core**) for the 6 Grade 11 general education core subjects rather than introducing a parallel Senior High School Track/Strand hierarchy.
