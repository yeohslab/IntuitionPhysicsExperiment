import type {
  BlockSegment,
  ExperimentStimulusSet,
  RestSegment,
  TopLevelSequenceItem,
} from "../types/experiment";

const FORMAL_PREFIX_LEN = 3;
const NUM_BLOCKS = 25;
const EXPECTED_SEQUENCE_LEN = FORMAL_PREFIX_LEN + NUM_BLOCKS * 2;

const BLOCK_PROGRESS_RE = /Block \d+ \/ \d+/g;

interface BlockPair {
  rest: RestSegment;
  block: BlockSegment;
}

function shuffleInPlace<T>(arr: T[], random: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

function renumberBlockProgressRest(rest: RestSegment, current: number, total: number): void {
  const label = `Block ${current} / ${total}`;
  for (const u of rest.units) {
    if (u.type === "textControl") {
      u.text = u.text.replace(BLOCK_PROGRESS_RE, label);
    }
  }
}

function assertFormalSequenceShape(sequence: TopLevelSequenceItem[]): void {
  if (sequence.length !== EXPECTED_SEQUENCE_LEN) {
    throw new Error(
      `刺激集 sequence 长度应为 ${EXPECTED_SEQUENCE_LEN}（欢迎 Rest + Practice + 任务 Rest + ${NUM_BLOCKS}×(BlockRest+Block)），实际 ${sequence.length}`,
    );
  }
  if (sequence[0]?.kind !== "rest") {
    throw new Error("sequence[0] 应为欢迎 Rest");
  }
  if (sequence[1]?.kind !== "practice") {
    throw new Error("sequence[1] 应为 Practice");
  }
  if (sequence[2]?.kind !== "rest") {
    throw new Error("sequence[2] 应为任务 Rest");
  }

  for (let b = 0; b < NUM_BLOCKS; b++) {
    const restIdx = FORMAL_PREFIX_LEN + b * 2;
    const blockIdx = restIdx + 1;
    if (sequence[restIdx]?.kind !== "rest") {
      throw new Error(`Block ${b + 1} 前应为 Rest（进度提示）`);
    }
    if (sequence[blockIdx]?.kind !== "block") {
      throw new Error(`Block ${b + 1} 应为 block 段`);
    }
  }
}

function extractBlockPairs(sequence: TopLevelSequenceItem[]): BlockPair[] {
  const pairs: BlockPair[] = [];
  for (let b = 0; b < NUM_BLOCKS; b++) {
    const restIdx = FORMAL_PREFIX_LEN + b * 2;
    const blockIdx = restIdx + 1;
    pairs.push({
      rest: sequence[restIdx] as RestSegment,
      block: sequence[blockIdx] as BlockSegment,
    });
  }
  return pairs;
}

/**
 * 正式实验：保持欢迎/练习/任务 Rest 与 Practice 不变，随机打乱 25 个 (Block 前 Rest, Block) 对，
 * 并按呈现顺序将进度 Rest 文案重编号为 Block 1/25 … 25/25。
 */
export function shuffleFormalBlocks(set: ExperimentStimulusSet): ExperimentStimulusSet {
  const cloned = structuredClone(set);
  const { sequence } = cloned;

  assertFormalSequenceShape(sequence);

  const prefix = sequence.slice(0, FORMAL_PREFIX_LEN);
  const pairs = extractBlockPairs(sequence);

  shuffleInPlace(pairs, Math.random);

  const tail: TopLevelSequenceItem[] = [];
  pairs.forEach((pair, i) => {
    renumberBlockProgressRest(pair.rest, i + 1, NUM_BLOCKS);
    tail.push(pair.rest, pair.block);
  });

  cloned.sequence = [...prefix, ...tail];
  return cloned;
}
