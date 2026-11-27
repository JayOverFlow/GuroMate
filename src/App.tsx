import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppShell,
  WORKSPACES,
  type WorkspaceId,
} from "./components/AppShell";
import { ConfirmDialog } from "./components/ConfirmDialog";
import type { GuroMateSettings, SessionNumber } from "./engine/types";
import { useClassroomTimer } from "./hooks/useClassroomTimer";
import { useConfirmDialog } from "./hooks/useConfirmDialog";
import { isLeavingActiveLesson } from "./hooks/workspaceLaunchHelpers";
import { buildUnsavedChangesPrompt } from "./utils/confirmAction";
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
  force?: boolean;
  beforeCommit?: () => void;
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

  const timer = useClassroomTimer();
  const {
    state: confirmState,
    requestConfirm,
    confirm: confirmNavigation,
    cancel: cancelNavigation,
  } = useConfirmDialog();
  const routeRef = useRef<AppRoute>(route);
  routeRef.current = route;
  const dirtyRef = useRef<{ isDirty: boolean; lessonLabel?: string }>({
    isDirty: false,
  });
  const activeWorkspace = route.workspace;

  const handleBuilderDirtyChange = useCallback(
    (isDirty: boolean, lessonLabel?: string) => {
      dirtyRef.current = { isDirty, lessonLabel };
    },
    [],
  );

  const commitRoute = useCallback(
    (nextRoute: AppRoute, options: NavigateOptions = {}) => {
      routeRef.current = nextRoute;
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

  const navigateToRoute = useCallback(
    (nextRoute: AppRoute, options: NavigateOptions = {}) => {
      const perform = () => {
        options.beforeCommit?.();
        commitRoute(nextRoute, options);
      };

      if (
        !options.force &&
        dirtyRef.current.isDirty &&
        isLeavingActiveLesson(routeRef.current, nextRoute)
      ) {
        requestConfirm(
          buildUnsavedChangesPrompt(dirtyRef.current.lessonLabel),
          () => {
            dirtyRef.current = { isDirty: false };
            perform();
          },
        );
        return;
      }

      if (options.force) {
        dirtyRef.current = { isDirty: false };
      }
      perform();
    },
    [commitRoute, requestConfirm],
  );

  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState(null, "", "#library");
    }
    const onHashChange = () => {
      const next = parseHashRoute(window.location.hash);
      const prev = routeRef.current;
      if (serializeHashRoute(next) === serializeHashRoute(prev)) {
        return;
      }

      if (dirtyRef.current.isDirty && isLeavingActiveLesson(prev, next)) {
        window.history.replaceState(null, "", serializeHashRoute(prev));
        requestConfirm(
          buildUnsavedChangesPrompt(dirtyRef.current.lessonLabel),
          () => {
            dirtyRef.current = { isDirty: false };
            routeRef.current = next;
            setRoute(next);
            if (next.workspace !== "library") {
              setLibraryNotice(null);
            }
            window.history.replaceState(null, "", serializeHashRoute(next));
          },
        );
        return;
      }

      routeRef.current = next;
      setRoute(next);
      if (next.workspace !== "library") {
        setLibraryNotice(null);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [requestConfirm]);

  useEffect(() => {
    const current = WORKSPACES.find((w) => w.id === activeWorkspace);
    document.title = `${current?.label ?? "GuroMate"} | GuroMate`;
  }, [activeWorkspace]);

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
    navigateToRoute(
      { workspace: "classroom" },
      { beforeCommit: () => setOpenTimerTabSignal((n) => n + 1) },
    );
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
          force: true,
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
          force: true,
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
          force: true,
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
          force: true,
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
      navigateToRoute(
        { workspace: "dll" },
        { beforeCommit: () => setDllTarget(target) },
      );
    },
    [navigateToRoute],
  );

  const handleLaunchDlp = useCallback(
    (target: DlpLaunchTarget) => {
      navigateToRoute(
        { workspace: "dlp" },
        { beforeCommit: () => setDlpTarget(target) },
      );
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
      navigateToRoute(
        { workspace: "quiz" },
        { beforeCommit: () => setQuizTarget(target) },
      );
    },
    [navigateToRoute],
  );

  const handleConsumeDllTarget = useCallback(() => setDllTarget(null), []);
  const handleConsumeDlpTarget = useCallback(() => setDlpTarget(null), []);
  const handleConsumeQuizTarget = useCallback(() => setQuizTarget(null), []);

  return (
    <>
      <AppShell
        activeWorkspace={activeWorkspace}
        onSelectWorkspace={handleNavClick}
        onOpenTimerWorkspace={handleOpenTimerWorkspace}
        timer={timer}
        teacherName={teacherName}
      >
        {route.workspace === "library" ? (
          <LessonLibraryWorkspace
            notice={libraryNotice}
            onDismissNotice={() => setLibraryNotice(null)}
            onNewDll={() => navigateToRoute({ workspace: "dll" })}
            onNewDlp={() => navigateToRoute({ workspace: "dlp" })}
            onOpenDll={handleOpenDll}
            onOpenDlp={handleOpenDlp}
            onDeriveDlp={handleDeriveDlp}
            onCreateQuiz={handleLaunchQuiz}
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
            onDirtyChange={handleBuilderDirtyChange}
            onDeriveDlp={handleDeriveDlp}
            onCreateQuiz={(dllId, sessionNumber) =>
              handleLaunchQuiz({ sourceKind: "dll", dllId, sessionNumber })
            }
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
            onDirtyChange={handleBuilderDirtyChange}
            onOpenParentDll={(dllId) => handleOpenDll(dllId, "edit")}
            onCreateQuiz={(dlpId) =>
              handleLaunchQuiz({ sourceKind: "dlp", dlpId })
            }
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

      <ConfirmDialog
        state={confirmState}
        onConfirm={() => void confirmNavigation()}
        onCancel={cancelNavigation}
      />
    </>
  );
}
