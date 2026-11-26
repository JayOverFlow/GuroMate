import { useEffect, useState } from "react";
import {
  AppShell,
  WORKSPACES,
  type WorkspaceId,
} from "./components/AppShell";
import type { GuroMateSettings, SessionNumber } from "./engine/types";
import { useClassroomTimer } from "./hooks/useClassroomTimer";
import { ClassroomWorkspace } from "./workspaces/ClassroomWorkspace";
import { CurriculumWorkspace } from "./workspaces/CurriculumWorkspace";
import { DllWorkspace, type DllLaunchTarget } from "./workspaces/DllWorkspace";
import { DlpWorkspace, type DlpLaunchTarget } from "./workspaces/DlpWorkspace";
import { QuizWorkspace, type QuizLaunchTarget } from "./workspaces/QuizWorkspace";
import { SettingsWorkspace } from "./workspaces/SettingsWorkspace";

function parseWorkspaceFromHash(): WorkspaceId | null {
  const raw = window.location.hash.replace(/^#/, "") as WorkspaceId;
  return WORKSPACES.some((w) => w.id === raw) ? raw : null;
}

export function App() {
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>(
    () => parseWorkspaceFromHash() ?? "settings",
  );
  const [dllTarget, setDllTarget] = useState<DllLaunchTarget | null>(null);
  const [dlpTarget, setDlpTarget] = useState<DlpLaunchTarget | null>(null);
  const [quizTarget, setQuizTarget] = useState<QuizLaunchTarget | null>(null);
  const [teacherName, setTeacherName] = useState<string>("");
  const [openTimerTabSignal, setOpenTimerTabSignal] = useState(0);

  const timer = useClassroomTimer();

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

  function handleNavClick(id: WorkspaceId) {
    setActiveWorkspace(id);
  }

  function handleOpenTimerWorkspace() {
    setOpenTimerTabSignal((n) => n + 1);
    setActiveWorkspace("classroom");
    window.location.hash = "classroom";
  }

  function handleLaunchDll(target: DllLaunchTarget) {
    setDllTarget(target);
    setActiveWorkspace("dll");
    window.location.hash = "dll";
  }

  function handleLaunchDlp(target: DlpLaunchTarget) {
    setDlpTarget(target);
    setActiveWorkspace("dlp");
    window.location.hash = "dlp";
  }

  function handleDeriveDlp(dllId: string, sessionNumber: SessionNumber) {
    handleLaunchDlp({ mode: "derive", dllId, sessionNumber });
  }

  function handleLaunchQuiz(target: QuizLaunchTarget) {
    setQuizTarget(target);
    setActiveWorkspace("quiz");
    window.location.hash = "quiz";
  }

  return (
    <AppShell
      activeWorkspace={activeWorkspace}
      onSelectWorkspace={handleNavClick}
      onOpenTimerWorkspace={handleOpenTimerWorkspace}
      timer={timer}
      teacherName={teacherName}
    >
      {activeWorkspace === "dll" ? (
        <DllWorkspace
          initialLaunchTarget={dllTarget}
          onConsumeLaunchTarget={() => setDllTarget(null)}
          onDeriveDlp={handleDeriveDlp}
          onCreateQuiz={(dllId, sessionNumber) =>
            handleLaunchQuiz({ sourceKind: "dll", dllId, sessionNumber })
          }
        />
      ) : activeWorkspace === "dlp" ? (
        <DlpWorkspace
          initialLaunchTarget={dlpTarget}
          onConsumeLaunchTarget={() => setDlpTarget(null)}
          onCreateQuiz={(dlpId) =>
            handleLaunchQuiz({ sourceKind: "dlp", dlpId })
          }
        />
      ) : activeWorkspace === "quiz" ? (
        <QuizWorkspace
          initialLaunchTarget={quizTarget}
          onConsumeLaunchTarget={() => setQuizTarget(null)}
        />
      ) : activeWorkspace === "settings" ? (
        <SettingsWorkspace
          onSettingsSaved={(saved) =>
            setTeacherName(saved.profile.studentTeacherName)
          }
        />
      ) : activeWorkspace === "curriculum" ? (
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
