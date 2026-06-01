import type { ExperimentStimulusSet, TopLevelSequenceItem } from "../types/experiment";

/** 由被试编号与刺激集索引得到确定性种子（32-bit） */
export function blockShuffleSeed(subjectId: string, stimulusSetIndex: number): number {
  const s = `${subjectId}|${stimulusSetIndex}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

/**
 * 正式段起始处：Block 前 Rest 保持 JSON 顺序与文案，仅打乱 25 个 Block 段。
 */
export function shuffleFormalBlocksOnly(
  sequence: TopLevelSequenceItem[],
  seed: number,
): TopLevelSequenceItem[] {
  let formalStart = -1;
  for (let i = 0; i < sequence.length; i++) {
    const item = sequence[i]!;
    if (item.kind === "block") {
      formalStart = i - 1;
      break;
    }
  }
  if (formalStart < 0) return sequence;

  const prefix = sequence.slice(0, formalStart);
  const formal = sequence.slice(formalStart);
  if (formal.length % 2 !== 0) return sequence;

  const rests: TopLevelSequenceItem[] = [];
  const blocks: TopLevelSequenceItem[] = [];
  for (let i = 0; i < formal.length; i += 2) {
    rests.push(formal[i]!);
    blocks.push(formal[i + 1]!);
  }

  if (blocks.length === 0 || blocks.every((b) => b.kind !== "block")) return sequence;

  shuffleInPlace(blocks, mulberry32(seed));

  const tail: TopLevelSequenceItem[] = [];
  for (let i = 0; i < blocks.length; i++) {
    tail.push(rests[i]!, blocks[i]!);
  }

  return [...prefix, ...tail];
}

export function applySubjectBlockShuffle(
  set: ExperimentStimulusSet,
  subjectId: string,
  stimulusSetIndex: number,
): ExperimentStimulusSet {
  const seed = blockShuffleSeed(subjectId, stimulusSetIndex);
  return {
    ...set,
    sequence: shuffleFormalBlocksOnly(set.sequence, seed),
  };
}
