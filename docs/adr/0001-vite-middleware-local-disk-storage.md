# Vite Middleware for Local Disk Persistence and AI Proxy

We run GuroMate as a React + Vite application backed by a custom Vite server middleware plugin (`vite.config.ts`) that persists records and `.md` outputs directly to a local `./data` directory on disk, injects generated content into the official ILAW `.docx` templates, and proxies requests to personal AI provider APIs. This avoids browser-storage data loss (`localStorage`/`IndexedDB` wipes) and browser CORS blocks against AI providers without adding a separate backend process or database server to start and maintain.
