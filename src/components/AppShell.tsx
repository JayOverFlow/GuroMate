import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { ClassroomTimerState } from "../hooks/useClassroomTimer";
import { formatClock } from "../hooks/useClassroomTimer";
import type { WorkspaceId } from "../utils/workspaceRouting";

export type { WorkspaceId };

export interface WorkspaceDef {
  id: WorkspaceId;
  label: string;
  breadcrumbGroup: string;
  statusTag: string;
  icon: string;
  description: string;
}

export const WORKSPACES: readonly WorkspaceDef[] = [
  {
    id: "library",
    label: "Lesson Library",
    breadcrumbGroup: "Lesson Authoring",
    statusTag: "Saved DLLs & DLPs",
    icon: "library_books",
    description:
      "Browse, open, export, and manage saved Daily Lesson Logs and Daily Lesson Plans.",
  },
  {
    id: "dll",
    label: "DLL Builder",
    breadcrumbGroup: "Lesson Authoring",
    statusTag: "5-Session ILAW",
    icon: "view_week",
    description:
      "Weekly 5-session Daily Lesson Logs (ILAW Framework) and .docx export.",
  },
  {
    id: "dlp",
    label: "DLP Builder",
    breadcrumbGroup: "Lesson Authoring",
    statusTag: "2-Column ILAW",
    icon: "splitscreen",
    description:
      "Single-session Daily Lesson Plans with Teacher's and Student's Activity.",
  },
  {
    id: "quiz",
    label: "Quiz Maker",
    breadcrumbGroup: "Assessment",
    statusTag: "Printable + Key",
    icon: "quiz",
    description:
      "Printable formative quizzes with Answer Key and lesson sync.",
  },
  {
    id: "classroom",
    label: "Classroom Tools",
    breadcrumbGroup: "Live Teaching",
    statusTag: "Offline Ready",
    icon: "groups",
    description:
      "Class Sections, Random Student Picker, Group Maker, and Classroom Timer.",
  },
  {
    id: "curriculum",
    label: "MATATAG Catalog",
    breadcrumbGroup: "Catalog & Settings",
    statusTag: "CG + Grades 7–12 BoW",
    icon: "menu_book",
    description:
      "Grades 7–12 MATATAG TLE, SHS Core, and Budget of Work catalog.",
  },
  {
    id: "settings",
    label: "Profile & AI Settings",
    breadcrumbGroup: "Catalog & Settings",
    statusTag: "Local Engine Active",
    icon: "tune",
    description:
      "Teacher Profile signatories and personal AI provider configuration.",
  },
];

function computeInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "GM";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

interface AppShellProps {
  activeWorkspace: WorkspaceId;
  onSelectWorkspace: (id: WorkspaceId) => void;
  onOpenTimerWorkspace: () => void;
  timer: ClassroomTimerState;
  teacherName?: string;
  children: ReactNode;
}

export function AppShell({
  activeWorkspace,
  onSelectWorkspace,
  onOpenTimerWorkspace,
  timer,
  teacherName,
  children,
}: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);

  const current =
    WORKSPACES.find((w) => w.id === activeWorkspace) ?? WORKSPACES[0]!;
  const isCatalogOrSettings =
    activeWorkspace === "curriculum" || activeWorkspace === "settings";

  const closeDrawer = useCallback(() => {
    const dialog = dialogRef.current;
    const scroller = scrollerRef.current;
    if (!dialog || !dialog.open) return;
    if (scroller) {
      scroller.scrollTo({ left: scroller.offsetWidth, behavior: "auto" });
    } else {
      dialog.close();
      setDrawerOpen(false);
    }
  }, []);

  const openDrawer = useCallback(async () => {
    const dialog = dialogRef.current;
    const scroller = scrollerRef.current;
    if (!dialog || !scroller) return;

    if (!dialog.open) {
      dialog.showModal();
    }

    if (!CSS.supports("scroll-initial-target", "nearest")) {
      scroller.scrollTo({ left: scroller.offsetWidth, behavior: "instant" });
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    }

    scroller.scrollTo({ left: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    const scroller = scrollerRef.current;
    const sheet = sheetRef.current;
    if (!dialog || !scroller || !sheet) return;

    const visibleThreshold = 1 / Math.max(window.innerWidth, 1);
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (!entry) return;
        if (entry.intersectionRatio < visibleThreshold && dialog.open) {
          dialog.close();
          setDrawerOpen(false);
        } else if (entry.intersectionRatio === 1 && dialog.open) {
          setDrawerOpen(true);
        }
      },
      { root: dialog, threshold: [visibleThreshold, 1] },
    );
    observer.observe(sheet);

    const onScrollFallback = !CSS.supports("animation-timeline: scroll()")
      ? () => {
          const width = Math.max(sheet.offsetWidth, 1);
          const ratio = Math.max(0, Math.min(1, 1 - scroller.scrollLeft / width));
          dialog.style.setProperty("--drawer-backdrop", String(ratio));
        }
      : null;

    if (onScrollFallback) {
      scroller.addEventListener("scroll", onScrollFallback, { passive: true });
    }

    const onCancel = (event: Event) => {
      if (event.cancelable) {
        event.preventDefault();
        closeDrawer();
      }
    };
    dialog.addEventListener("cancel", onCancel);

    return () => {
      observer.disconnect();
      if (onScrollFallback) {
        scroller.removeEventListener("scroll", onScrollFallback);
      }
      dialog.removeEventListener("cancel", onCancel);
    };
  }, [closeDrawer]);

  function handleNav(event: MouseEvent<HTMLAnchorElement>, id: WorkspaceId) {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }
    event.preventDefault();
    onSelectWorkspace(id);
    closeDrawer();
  }

  const displayTeacher = teacherName?.trim() || "Pre-Service Teacher";
  const initials = computeInitials(displayTeacher);

  const renderNavLinks = () => (
    <>
      <nav aria-label="Primary workspaces" className="flex flex-col gap-gutter-xs">
        {WORKSPACES.slice(0, 5).map((workspace) => {
          const isCurrent = activeWorkspace === workspace.id;
          return (
            <a
              key={workspace.id}
              href={`#${workspace.id}`}
              aria-current={isCurrent ? "page" : undefined}
              onClick={(event) => handleNav(event, workspace.id)}
              className={
                isCurrent
                  ? "flex items-center gap-gutter-sm px-gutter-sm py-gutter-sm rounded bg-primary text-on-primary font-label transition-colors duration-state-change focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  : "flex items-center gap-gutter-sm px-gutter-sm py-gutter-sm rounded text-on-surface-variant hover:bg-surface-container hover:text-on-surface font-label transition-colors duration-state-change focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              }
            >
              <span
                className={`material-symbols-outlined text-title-md ${isCurrent ? "is-filled" : ""}`}
                aria-hidden="true"
              >
                {workspace.icon}
              </span>
              <span className="text-label-lg">{workspace.label}</span>
            </a>
          );
        })}

        <a
          href="#curriculum"
          aria-current={isCatalogOrSettings ? "page" : undefined}
          onClick={(event) =>
            handleNav(
              event,
              activeWorkspace === "settings" ? "settings" : "curriculum",
            )
          }
          className={
            isCatalogOrSettings
              ? "flex items-center gap-gutter-sm px-gutter-sm py-gutter-sm rounded bg-primary text-on-primary font-label transition-colors duration-state-change focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              : "flex items-center gap-gutter-sm px-gutter-sm py-gutter-sm rounded text-on-surface-variant hover:bg-surface-container hover:text-on-surface font-label transition-colors duration-state-change focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          }
        >
          <span
            className={`material-symbols-outlined text-title-md ${isCatalogOrSettings ? "is-filled" : ""}`}
            aria-hidden="true"
          >
            tune
          </span>
          <span className="text-label-lg">Catalog &amp; Settings</span>
        </a>
      </nav>

      <div className="flex flex-col gap-gutter-xs pt-gutter-md border-t border-outline-variant">
        <span className="px-gutter-sm font-label text-label-sm text-on-surface-variant uppercase tracking-wider">
          Catalog &amp; Setup
        </span>
        <a
          href="#curriculum"
          aria-current={activeWorkspace === "curriculum" ? "page" : undefined}
          onClick={(event) => handleNav(event, "curriculum")}
          className={
            activeWorkspace === "curriculum"
              ? "px-gutter-sm py-gutter-xs rounded bg-surface-container-lowest border border-outline-variant flex items-center justify-between text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              : "px-gutter-sm py-gutter-xs rounded hover:bg-surface-container flex items-center justify-between text-on-surface transition-colors duration-state-change focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          }
        >
          <span className="font-label text-label-md">MATATAG Catalog</span>
          <span className="font-mono text-label-sm text-on-surface-variant tabular-nums">
            G7–12
          </span>
        </a>
        <a
          href="#settings"
          aria-current={activeWorkspace === "settings" ? "page" : undefined}
          onClick={(event) => handleNav(event, "settings")}
          className={
            activeWorkspace === "settings"
              ? "px-gutter-sm py-gutter-xs rounded bg-surface-container-lowest border border-outline-variant flex items-center justify-between text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              : "px-gutter-sm py-gutter-xs rounded hover:bg-surface-container flex items-center justify-between text-on-surface transition-colors duration-state-change focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          }
        >
          <span className="font-label text-label-md">
            Profile &amp; AI Settings
          </span>
          <span
            className="material-symbols-outlined text-body-md text-on-surface-variant"
            aria-hidden="true"
          >
            {activeWorkspace === "settings" ? "check_circle" : "arrow_forward"}
          </span>
        </a>
      </div>
    </>
  );

  const renderSidebarFooter = () => (
    <div className="flex flex-col gap-gutter-sm pt-gutter-md border-t border-outline-variant">
      <div className="flex items-center gap-gutter-sm px-gutter-xs">
        <span
          role="status"
          className="inline-flex items-center gap-gutter-xs px-gutter-sm py-gutter-xs rounded-full bg-success-container text-on-success-container font-label"
        >
          <span
            className="material-symbols-outlined text-body-sm"
            aria-hidden="true"
          >
            hard_drive
          </span>
          <span className="text-label-sm">Saved to ./data</span>
        </span>
      </div>
      <div className="flex items-center gap-gutter-sm px-gutter-xs">
        <div className="w-8 h-8 rounded-full bg-surface-variant text-on-surface-variant flex items-center justify-center shrink-0">
          <span className="font-label text-label-md">{initials}</span>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-label text-label-md text-on-surface truncate">
            {displayTeacher}
          </span>
          <span className="font-body text-body-sm text-on-surface-variant">
            Pre-Service Teacher
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-surface text-on-surface font-body">
      <a
        href="#main-content"
        className="visually-hidden skip-link focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:rounded focus:bg-primary focus:text-on-primary focus:font-label"
      >
        Skip to main content
      </a>

      {/* Desktop Persistent Left Navigation Rail */}
      <aside className="hidden lg:flex w-64 shrink-0 min-h-screen sticky top-0 max-h-screen overflow-y-auto bg-surface-container-low border-r border-outline-variant flex-col justify-between p-gutter-md">
        <div className="flex flex-col gap-gutter-lg">
          <a
            href="#library"
            onClick={(event) => handleNav(event, "library")}
            className="flex items-center gap-gutter-sm px-gutter-sm pt-gutter-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary rounded"
          >
            <div className="w-9 h-9 rounded bg-primary text-on-primary flex items-center justify-center shrink-0">
              <span
                className="material-symbols-outlined text-title-lg"
                aria-hidden="true"
              >
                menu_book
              </span>
            </div>
            <div className="flex flex-col">
              <span className="font-title text-title-lg text-on-surface leading-tight">
                GuroMate
              </span>
              <span className="font-label text-label-sm text-on-surface-variant">
                TLE ILAW Studio
              </span>
            </div>
          </a>

          {renderNavLinks()}
        </div>

        {renderSidebarFooter()}
      </aside>

      {/* Mobile Navigation Drawer (<dialog> + scroll-snap swipe) */}
      <dialog
        ref={dialogRef}
        id="workspace-drawer"
        className="NavDrawer lg:hidden"
        aria-label="Workspace navigation"
        onClick={(event) => {
          if (sheetRef.current && !sheetRef.current.contains(event.target as Node)) {
            closeDrawer();
          }
        }}
      >
        <div ref={scrollerRef} className="NavDrawer-scroller">
          <nav
            ref={sheetRef}
            aria-label="Mobile workspace navigation"
            className="NavDrawer-sheet bg-surface-container-low border-r border-outline-variant p-gutter-md flex flex-col justify-between gap-gutter-lg"
          >
            <div className="flex flex-col gap-gutter-lg">
              <div className="flex items-center justify-between px-gutter-xs">
                <div className="flex items-center gap-gutter-sm">
                  <div className="w-8 h-8 rounded bg-primary text-on-primary flex items-center justify-center shrink-0">
                    <span
                      className="material-symbols-outlined text-title-md"
                      aria-hidden="true"
                    >
                      menu_book
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-title text-title-md text-on-surface">
                      GuroMate
                    </span>
                    <span className="font-label text-label-sm text-on-surface-variant">
                      TLE ILAW Studio
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  autoFocus
                  aria-label="Close navigation menu"
                  onClick={closeDrawer}
                  className="inline-flex items-center justify-center w-9 h-9 rounded text-on-surface hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <span
                    className="material-symbols-outlined text-title-lg"
                    aria-hidden="true"
                  >
                    close
                  </span>
                </button>
              </div>
              {renderNavLinks()}
            </div>
            {renderSidebarFooter()}
          </nav>
        </div>
      </dialog>

      {/* Main Workspace Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 bg-surface/95 backdrop-blur-xs border-b border-outline-variant px-gutter-md lg:px-page-margin py-gutter-sm flex flex-wrap items-center justify-between gap-gutter-md">
          <div className="flex items-center gap-gutter-sm min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              aria-expanded={drawerOpen}
              aria-controls="workspace-drawer"
              onClick={() => void openDrawer()}
              className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded bg-surface-container-lowest border border-outline-variant text-on-surface hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span
                className="material-symbols-outlined text-title-lg"
                aria-hidden="true"
              >
                menu
              </span>
            </button>

            <span className="hidden sm:inline font-label text-label-md text-on-surface-variant">
              {current.breadcrumbGroup}
            </span>
            <span
              className="hidden sm:inline text-on-surface-variant"
              aria-hidden="true"
            >
              /
            </span>
            <span className="font-title text-title-md text-on-surface truncate">
              {current.label}
            </span>
            <span className="hidden md:inline-flex items-center gap-gutter-xs px-gutter-sm py-gutter-xs rounded-full bg-surface-variant text-on-surface-variant font-label text-label-sm">
              {current.statusTag}
            </span>
          </div>

          <div className="flex items-center gap-gutter-sm">
            {/* Persistent Classroom Timer Mini-Bar */}
            <div
              className={`flex items-center gap-gutter-sm px-gutter-sm py-gutter-xs rounded bg-surface-container-lowest border ${
                timer.timerExpired
                  ? "border-error bg-error-container/30"
                  : "border-outline-variant"
              }`}
            >
              <span
                role="status"
                aria-label={
                  timer.timerExpired
                    ? "Timer finished"
                    : timer.timerRunning
                      ? "Timer running"
                      : "Timer ready"
                }
                className={`inline-block w-2 h-2 rounded-full ${
                  timer.timerExpired
                    ? "bg-error"
                    : timer.timerRunning
                      ? "bg-secondary"
                      : "bg-success"
                }`}
              />
              <span className="hidden sm:inline font-label text-label-sm text-on-surface-variant">
                Class Timer
              </span>
              <span className="font-mono text-mono-md text-on-surface tabular-nums">
                {formatClock(timer.remainingSeconds)}
              </span>
              <button
                type="button"
                aria-label={
                  timer.timerRunning
                    ? "Pause classroom timer"
                    : "Start classroom timer"
                }
                onClick={timer.timerRunning ? timer.pauseTimer : timer.startTimer}
                className="inline-flex items-center justify-center w-7 h-7 rounded-sm text-primary hover:bg-surface-container transition-colors duration-state-change focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span
                  className="material-symbols-outlined text-title-md"
                  aria-hidden="true"
                >
                  {timer.timerRunning ? "pause" : "play_arrow"}
                </span>
              </button>
              <button
                type="button"
                aria-label="Open Classroom Tools Timer"
                onClick={onOpenTimerWorkspace}
                className="inline-flex items-center justify-center w-7 h-7 rounded-sm text-on-surface-variant hover:bg-surface-container transition-colors duration-state-change focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span
                  className="material-symbols-outlined text-body-md"
                  aria-hidden="true"
                >
                  open_in_full
                </span>
              </button>
            </div>
          </div>
        </header>

        <main
          id="main-content"
          className="flex-1 p-gutter-md lg:p-page-margin w-full max-w-[1360px] mx-auto"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
