import { useEffect, useRef, useState } from "react";
import type { SessionNumber } from "./engine/types";
import { ClassroomWorkspace } from "./workspaces/ClassroomWorkspace";
import { CurriculumWorkspace } from "./workspaces/CurriculumWorkspace";
import { DllWorkspace } from "./workspaces/DllWorkspace";
import { DlpWorkspace, type DeriveDlpTarget } from "./workspaces/DlpWorkspace";
import { SettingsWorkspace } from "./workspaces/SettingsWorkspace";

type WorkspaceId =
  | "dll"
  | "dlp"
  | "quiz"
  | "classroom"
  | "curriculum"
  | "settings";

interface WorkspaceDef {
  id: WorkspaceId;
  label: string;
  description: string;
}

const WORKSPACES: WorkspaceDef[] = [
  {
    id: "dll",
    label: "DLL Builder",
    description:
      "Weekly 5-session Daily Lesson Logs (ILAW Framework) and .docx export.",
  },
  {
    id: "dlp",
    label: "DLP Builder",
    description:
      "Single-session Daily Lesson Plans with Teacher's and Student's Activity.",
  },
  {
    id: "quiz",
    label: "Quiz Maker",
    description:
      "Printable formative quizzes with Answer Key and lesson sync.",
  },
  {
    id: "classroom",
    label: "Classroom Tools",
    description:
      "Class Sections, Random Student Picker, Group Maker, and Classroom Timer.",
  },
  {
    id: "curriculum",
    label: "Curriculum",
    description:
      "Grades 7-10 MATATAG TLE Curriculum Guide and Budget of Work catalog.",
  },
  {
    id: "settings",
    label: "Settings",
    description:
      "Teacher Profile signatories and personal AI provider configuration.",
  },
];

function parseWorkspaceFromHash(): WorkspaceId | null {
  const raw = window.location.hash.replace(/^#/, "") as WorkspaceId;
  return WORKSPACES.some((w) => w.id === raw) ? raw : null;
}

export function App() {
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>(
    () => parseWorkspaceFromHash() ?? "settings",
  );
  const [deriveTarget, setDeriveTarget] = useState<DeriveDlpTarget | null>(null);
  const [isWide, setIsWide] = useState(false);

  const headerRef = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const onHashChange = () => {
      const next = parseWorkspaceFromHash();
      if (next) setActiveWorkspace(next);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const current = WORKSPACES.find((w) => w.id === activeWorkspace);
    document.title = `${current?.label ?? "GuroMate"} | GuroMate`;
  }, [activeWorkspace]);

  useEffect(() => {
    const header = headerRef.current;
    const inner = innerRef.current;
    const menu = menuRef.current;
    if (!header || !inner || !menu) return;

    let lastHeaderWidth = header.getBoundingClientRect().width;
    let wideNow = false;
    let rafId = 0;

    const applyLayout = (wide: boolean) => {
      wideNow = wide;
      setIsWide(wide);
      const wasOpen = menu.matches(":popover-open, .\\:popover-open");
      if (wide) {
        menu.removeAttribute("popover");
      } else {
        menu.setAttribute("popover", "auto");
        if (wasOpen) {
          try {
            menu.showPopover();
          } catch {
            // Ignore when polyfill/native popover is already transitioning.
          }
        }
      }
    };

    const measure = () => {
      header.classList.add("is-measuring", "is-wide");
      menu.removeAttribute("popover");
      const fits = inner.scrollWidth <= inner.clientWidth;
      if (!fits) {
        header.classList.remove("is-wide");
      }
      applyLayout(fits);
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        header.classList.remove("is-measuring");
      });
    };

    measure();

    const observer = new ResizeObserver((entries) => {
      const nextWidth = header.getBoundingClientRect().width;
      const grew = nextWidth > lastHeaderWidth;
      lastHeaderWidth = nextWidth;
      const menuChanged = entries.some((entry) => entry.target === menu);
      if (wideNow || grew || menuChanged) {
        measure();
      }
    });
    observer.observe(header);
    observer.observe(menu);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  const currentWorkspace =
    WORKSPACES.find((w) => w.id === activeWorkspace) ?? WORKSPACES[5]!;

  function handleNavClick(id: WorkspaceId) {
    setActiveWorkspace(id);
    if (!isWide && menuRef.current?.matches(":popover-open, .\\:popover-open")) {
      try {
        menuRef.current.hidePopover();
      } catch {
        // Ignore if already closed.
      }
    }
  }

  function handleDeriveDlp(dllId: string, sessionNumber: SessionNumber) {
    setDeriveTarget({ dllId, sessionNumber });
    setActiveWorkspace("dlp");
    window.location.hash = "dlp";
  }

  return (
    <>
      <header ref={headerRef} className={`site-header${isWide ? " is-wide" : ""}`}>
        <a href="#main-content" className="skip-link visually-hidden">
          Skip to main content
        </a>
        <div ref={innerRef} className="header-inner">
          <a className="site-brand" href="#settings">
            <span>GuroMate</span>
            <span className="brand-tag">MATATAG TLE</span>
          </a>

          <nav className="site-nav" aria-label="Primary">
            <button
              className="menu-button"
              type="button"
              {...({
                popovertarget: "site-menu",
                popovertargetaction: "toggle",
              } as Record<string, string>)}
              aria-controls="site-menu"
            >
              <svg
                aria-hidden="true"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
              <span>Menu</span>
            </button>

            <ul
              ref={menuRef}
              id="site-menu"
              className="site-menu"
              {...(!isWide ? ({ popover: "auto" } as Record<string, string>) : {})}
            >
              {WORKSPACES.map((workspace) => (
                <li key={workspace.id}>
                  <a
                    href={`#${workspace.id}`}
                    aria-current={
                      activeWorkspace === workspace.id ? "page" : undefined
                    }
                    onClick={() => handleNavClick(workspace.id)}
                  >
                    {workspace.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main id="main-content" className="app-main">
        {activeWorkspace === "dll" ? (
          <DllWorkspace onDeriveDlp={handleDeriveDlp} />
        ) : activeWorkspace === "dlp" ? (
          <DlpWorkspace
            initialDeriveTarget={deriveTarget}
            onConsumeDeriveTarget={() => setDeriveTarget(null)}
          />
        ) : activeWorkspace === "settings" ? (
          <SettingsWorkspace />
        ) : activeWorkspace === "curriculum" ? (
          <CurriculumWorkspace />
        ) : activeWorkspace === "classroom" ? (
          <ClassroomWorkspace />
        ) : (
          <section className="card" aria-labelledby="workspace-heading">
            <div className="workspace-header">
              <h1 id="workspace-heading" tabIndex={-1}>
                {currentWorkspace.label}
              </h1>
              <p className="workspace-subtitle">
                {currentWorkspace.description}
              </p>
            </div>
            <p>
              This workspace is scheduled for implementation in a subsequent
              issue. Use <a href="#settings">Settings</a> to configure Teacher
              Profile signatories and your personal AI provider.
            </p>
          </section>
        )}
      </main>
    </>
  );
}
