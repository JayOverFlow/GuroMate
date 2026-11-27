import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppShell,
  WORKSPACES,
  type WorkspaceId,
} from "./components/AppShell";
import type { GuroMateSettings, SessionNumber } from "./engine/types";
import { useClassroomTimer } from "./hooks/useClassroomTimer";
import {
  canUseFocusReadingMode,
  resolveFocusReadingModeAfterRouteChange,
  shouldExitFocusReadingModeOnKeyDown,
  toggleFocusReadingMode,
} from "./utils/focusReadingMode";
import {
  buildDeletedLessonNotice,
  buildMissingLessonNotice,
  parseHashRoute,
  serializeHashRoute,
  type AppRoute,
  type LessonViewMode,
} from "./utils/workspaceRouting";
import { ClassroomWorkspace } from "./workspaces/ClassroomWorkspace";
import { CurriculumWorkspace } from "./workspaces/CurriculumWorkspace";
import { DllWorkspace, type DllLaunchTarget } from "./workspaces/DllWorkspace";
import { DlpWorkspace, type DlpLaunchTarget } from "./workspaces/DlpWorkspace";
import {
  LessonLibraryWorkspace,
  type LessonLibraryNotice,
} from "./workspaces/LessonLibraryWorkspace";
import { QuizWorkspace, type QuizLaunchTarget } from "./workspaces/QuizWorkspace";
import { SettingsWorkspace } from "./workspaces/SettingsWorkspace";

interface NavigateOptions {
  replace?: boolean;
  notice?: LessonLibraryNotice | null;
}

export function App() {
  const [route, setRoute] = useState<AppRoute>(() =>
    parseHashRoute(window.location.hash),
  );
  const [libraryNotice, setLibraryNotice] =
    useState<LessonLibraryNotice | null>(null);
  const [dllTarget, setDllTarget] = useState<DllLaunchTarget | null>(null);
  const [dlpTarget, setDlpTarget] = useState<DlpLaunchTarget | null>(null);
  const [quizTarget, setQuizTarget] = useState<QuizLaunchTarget | null>(null);
  const [teacherName, setTeacherName] = useState<string>("");
  const [openTimerTabSignal, setOpenTimerTabSignal] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const prevRouteRef = useRef<AppRoute>(route);

  const timer = useClassroomTimer();
  const activeWorkspace = route.workspace;
  const activeFocusMode = focusMode && canUseFocusReadingMode(route);

  const navigateToRoute = useCallback(
    (nextRoute: AppRoute, options: NavigateOptions = {}) => {
      setRoute(nextRoute);
      if (options.notice !== undefined) {
        setLibraryNotice(options.notice);
      } else {
        setLibraryNotice(null);
      }
      const nextHash = serializeHashRoute(nextRoute);
      if (window.location.hash !== nextHash) {
        if (options.replace) {
          window.history.replaceState(null, "", nextHash);
        } else {
          window.location.hash = nextHash;
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState(null, "", "#library");
    }
    const onHashChange = () => {
      const next = parseHashRoute(window.location.hash);
      setRoute(next);
      if (next.workspace !== "library") {
        setLibraryNotice(null);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const current = WORKSPACES.find((w) => w.id === activeWorkspace);
    document.title = `${current?.label ?? "GuroMate"} | GuroMate`;
  }, [activeWorkspace]);

  useEffect(() => {
    const prevRoute = prevRouteRef.current;
    prevRouteRef.current = route;
    setFocusMode((active) =>
      resolveFocusReadingModeAfterRouteChange(active, prevRoute, route),
    );
  }, [route]);

  useEffect(() => {
    if (!activeFocusMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const hasOpenDialog = Boolean(document.querySelector("dialog[open]"));
      if (
        shouldExitFocusReadingModeOnKeyDown({
          focusMode: true,
          key: event.key,
          hasOpenDialog,
          defaultPrevented: event.defaultPrevented,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          metaKey: event.metaKey,
        })
      ) {
        event.preventDefault();
        setFocusMode(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeFocusMode]);

  useEffect(() => {
    let active = true;
    void fetch("/api/settings")
      .then((res) => (res.ok ? (res.json() as Promise<GuroMateSettings>) : null))
      .then((data) => {
        if (active && data?.profile?.studentTeacherName) {
          setTeacherName(data.profile.studentTeacherName);
        }
      })
      .catch(() => {
        // Ignore; SettingsWorkspace reports load errors directly.
      });
    return () => {
      active = false;
    };
  }, []);

  const handleNavClick = useCallback(
    (id: WorkspaceId) => {
      navigateToRoute({ workspace: id });
    },
    [navigateToRoute],
  );

  const handleOpenTimerWorkspace = useCallback(() => {
    setOpenTimerTabSignal((n) => n + 1);
    navigateToRoute({ workspace: "classroom" });
  }, [navigateToRoute]);

  const handleBackToLibrary = useCallback(() => {
    navigateToRoute({ workspace: "library" });
  }, [navigateToRoute]);

  const handleOpenDll = useCallback(
    (lessonId: string, viewMode: LessonViewMode = "edit") => {
      navigateToRoute({ workspace: "dll", lessonId, viewMode });
    },
    [navigateToRoute],
  );

  const handleOpenDlp = useCallback(
    (lessonId: string, viewMode: LessonViewMode = "edit") => {
      navigateToRoute({ workspace: "dlp", lessonId, viewMode });
    },
    [navigateToRoute],
  );

  const handleDllRouteChange = useCallback(
    (lessonId?: string, viewMode?: LessonViewMode) => {
      navigateToRoute(
        lessonId
          ? { workspace: "dll", lessonId, viewMode: viewMode ?? "edit" }
          : { workspace: "dll" },
      );
    },
    [navigateToRoute],
  );

  const handleDlpRouteChange = useCallback(
    (lessonId?: string, viewMode?: LessonViewMode) => {
      navigateToRoute(
        lessonId
          ? { workspace: "dlp", lessonId, viewMode: viewMode ?? "edit" }
          : { workspace: "dlp" },
      );
    },
    [navigateToRoute],
  );

  const handleMissingDll = useCallback(
    (lessonId: string) => {
      navigateToRoute(
        { workspace: "library" },
        {
          replace: true,
          notice: {
            tone: "info",
            text: buildMissingLessonNotice("dll", lessonId),
          },
        },
      );
    },
    [navigateToRoute],
  );

  const handleMissingDlp = useCallback(
    (lessonId: string) => {
      navigateToRoute(
        { workspace: "library" },
        {
          replace: true,
          notice: {
            tone: "info",
            text: buildMissingLessonNotice("dlp", lessonId),
          },
        },
      );
    },
    [navigateToRoute],
  );

  const handleDeletedDll = useCallback(
    (lessonTitle: string) => {
      navigateToRoute(
        { workspace: "library" },
        {
          notice: {
            tone: "success",
            text: buildDeletedLessonNotice("dll", lessonTitle),
          },
        },
      );
    },
    [navigateToRoute],
  );

  const handleDeletedDlp = useCallback(
    (lessonTitle: string) => {
      navigateToRoute(
        { workspace: "library" },
        {
          notice: {
            tone: "success",
            text: buildDeletedLessonNotice("dlp", lessonTitle),
          },
        },
      );
    },
    [navigateToRoute],
  );

  const handleLaunchDll = useCallback(
    (target: DllLaunchTarget) => {
      setDllTarget(target);
      navigateToRoute({ workspace: "dll" });
    },
    [navigateToRoute],
  );

  const handleLaunchDlp = useCallback(
    (target: DlpLaunchTarget) => {
      setDlpTarget(target);
      navigateToRoute({ workspace: "dlp" });
    },
    [navigateToRoute],
  );

  const handleDeriveDlp = useCallback(
    (dllId: string, sessionNumber: SessionNumber) => {
      handleLaunchDlp({ mode: "derive", dllId, sessionNumber });
    },
    [handleLaunchDlp],
  );

  const handleLaunchQuiz = useCallback(
    (target: QuizLaunchTarget) => {
      setQuizTarget(target);
      navigateToRoute({ workspace: "quiz" });
    },
    [navigateToRoute],
  );

  const handleConsumeDllTarget = useCallback(() => setDllTarget(null), []);
  const handleConsumeDlpTarget = useCallback(() => setDlpTarget(null), []);
  const handleConsumeQuizTarget = useCallback(() => setQuizTarget(null), []);

  const handleToggleFocusMode = useCallback(() => {
    setFocusMode((active) => toggleFocusReadingMode(active, route));
  }, [route]);

  const handleExitFocusMode = useCallback(() => {
    setFocusMode(false);
  }, []);

  return (
    <AppShell
      activeWorkspace={activeWorkspace}
      onSelectWorkspace={handleNavClick}
      onOpenTimerWorkspace={handleOpenTimerWorkspace}
      timer={timer}
      teacherName={teacherName}
      focusMode={activeFocusMode}
      onExitFocusMode={handleExitFocusMode}
    >
      {route.workspace === "library" ? (
        <LessonLibraryWorkspace
          notice={libraryNotice}
          onDismissNotice={() => setLibraryNotice(null)}
          onNewDll={() => navigateToRoute({ workspace: "dll" })}
          onNewDlp={() => navigateToRoute({ workspace: "dlp" })}
          onOpenDll={handleOpenDll}
          onOpenDlp={handleOpenDlp}
          onOpenSettings={() => navigateToRoute({ workspace: "settings" })}
        />
      ) : route.workspace === "dll" ? (
        <DllWorkspace
          initialLaunchTarget={dllTarget}
          onConsumeLaunchTarget={handleConsumeDllTarget}
          routeLessonId={route.lessonId}
          routeViewMode={route.viewMode}
          onRouteChange={handleDllRouteChange}
          onBackToLibrary={handleBackToLibrary}
          onMissingLesson={handleMissingDll}
          onDeletedLesson={handleDeletedDll}
          onDeriveDlp={handleDeriveDlp}
          onCreateQuiz={(dllId, sessionNumber) =>
            handleLaunchQuiz({ sourceKind: "dll", dllId, sessionNumber })
          }
          focusMode={activeFocusMode}
          onToggleFocusMode={handleToggleFocusMode}
          onExitFocusMode={handleExitFocusMode}
        />
      ) : route.workspace === "dlp" ? (
        <DlpWorkspace
          initialLaunchTarget={dlpTarget}
          onConsumeLaunchTarget={handleConsumeDlpTarget}
          routeLessonId={route.lessonId}
          routeViewMode={route.viewMode}
          onRouteChange={handleDlpRouteChange}
          onBackToLibrary={handleBackToLibrary}
          onMissingLesson={handleMissingDlp}
          onDeletedLesson={handleDeletedDlp}
          onCreateQuiz={(dlpId) =>
            handleLaunchQuiz({ sourceKind: "dlp", dlpId })
          }
          focusMode={activeFocusMode}
          onToggleFocusMode={handleToggleFocusMode}
          onExitFocusMode={handleExitFocusMode}
        />
      ) : route.workspace === "quiz" ? (
        <QuizWorkspace
          initialLaunchTarget={quizTarget}
          onConsumeLaunchTarget={handleConsumeQuizTarget}
        />
      ) : route.workspace === "settings" ? (
        <SettingsWorkspace
          onSettingsSaved={(saved) =>
            setTeacherName(saved.profile.studentTeacherName)
          }
        />
      ) : route.workspace === "curriculum" ? (
        <CurriculumWorkspace
          onUseInDll={(competencyId) => handleLaunchDll({ competencyId })}
          onUseInDlp={(competencyId) =>
            handleLaunchDlp({ mode: "scratch", competencyId })
          }
          onUseInQuiz={(competencyId) =>
            handleLaunchQuiz({ sourceKind: "standalone", competencyId })
          }
        />
      ) : (
        <ClassroomWorkspace
          timer={timer}
          openTimerTabSignal={openTimerTabSignal}
        />
      )}
    </AppShell>
  );
}
