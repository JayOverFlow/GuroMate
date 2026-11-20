export interface RosterStudent {
  index: number;
  name: string;
}

export interface RandomDrawResult {
  picked: RosterStudent | null;
  nextUsedIndices: Set<number>;
  exhausted: boolean;
}

export interface GroupGenerationOptions {
  mode: "count" | "size";
  value: number;
}

export interface GroupSlot {
  groupIndex: number;
  studentIndex: number;
}

/** Returns present roster entries in original order, excluding absent indices. */
export function filterPresentStudents(
  students: readonly string[],
  absentIndices: ReadonlySet<number>,
): RosterStudent[] {
  const present: RosterStudent[] = [];
  for (let index = 0; index < students.length; index++) {
    if (!absentIndices.has(index)) {
      present.push({ index, name: students[index]! });
    }
  }
  return present;
}

/** Draws a random present student with or without replacement. */
export function drawRandomStudent(
  present: readonly RosterStudent[],
  usedIndices: ReadonlySet<number>,
  removeFromPool: boolean,
  random: () => number = Math.random,
): RandomDrawResult {
  const candidates = removeFromPool
    ? present.filter((s) => !usedIndices.has(s.index))
    : present;

  if (candidates.length === 0) {
    return {
      picked: null,
      nextUsedIndices: new Set(usedIndices),
      exhausted: true,
    };
  }

  const pickIdx = Math.min(
    candidates.length - 1,
    Math.floor(random() * candidates.length),
  );
  const picked = candidates[pickIdx]!;
  const nextUsedIndices = new Set(usedIndices);
  if (removeFromPool) {
    nextUsedIndices.add(picked.index);
  }
  return {
    picked,
    nextUsedIndices,
    exhausted: false,
  };
}

/** Shuffles and partitions present students evenly by group count or max group size. */
export function generateStudentGroups(
  present: readonly RosterStudent[],
  options: GroupGenerationOptions,
  random: () => number = Math.random,
): RosterStudent[][] {
  if (present.length === 0) return [];
  const rawValue = Math.floor(options.value);
  const safeValue = Number.isFinite(rawValue) && rawValue >= 1 ? rawValue : 1;

  const groupCount =
    options.mode === "count"
      ? Math.min(safeValue, present.length)
      : Math.max(1, Math.ceil(present.length / safeValue));

  const shuffled = [...present];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }

  const groups: RosterStudent[][] = Array.from(
    { length: groupCount },
    () => [],
  );
  shuffled.forEach((student, idx) => {
    groups[idx % groupCount]!.push(student);
  });
  return groups;
}

/** Returns a new group list with two student slots swapped. */
export function swapGroupStudents(
  groups: readonly (readonly RosterStudent[])[],
  a: GroupSlot,
  b: GroupSlot,
): RosterStudent[][] {
  const next = groups.map((group) => [...group]);
  const first = next[a.groupIndex]?.[a.studentIndex];
  const second = next[b.groupIndex]?.[b.studentIndex];
  if (first === undefined || second === undefined) {
    return next;
  }
  next[a.groupIndex]![a.studentIndex] = second;
  next[b.groupIndex]![b.studentIndex] = first;
  return next;
}
