// Thresholds come from labeled examples, not guesses (Decisions guide: weigh false positives
// against false negatives on your own data). A consumer keeps a fixture of real inputs with the
// answer a human gave, scores the model's probabilities against it, and picks the lowest threshold
// that keeps false positives at or below what it can tolerate.

/** One labeled example: the model's probability that the condition holds, and the truth. */
export interface LabeledProbability {
  probability: number;
  truth: boolean;
}

export interface ThresholdReport {
  threshold: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  trueNegatives: number;
  precision: number;
  recall: number;
}

export function scoreThreshold(
  examples: readonly LabeledProbability[],
  threshold: number,
): ThresholdReport {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const { probability, truth } of examples) {
    const said = probability >= threshold;
    if (said && truth) tp++;
    else if (said && !truth) fp++;
    else if (!said && truth) fn++;
    else tn++;
  }
  return {
    threshold,
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    trueNegatives: tn,
    precision: tp + fp ? tp / (tp + fp) : 1,
    recall: tp + fn ? tp / (tp + fn) : 1,
  };
}

/**
 * The lowest threshold (on a 0.01 grid) with at most `maxFalsePositives` false positives, so
 * recall is as high as that allows. Returns 1 when even 1.0 has too many.
 */
export function pickThreshold(
  examples: readonly LabeledProbability[],
  maxFalsePositives = 0,
): ThresholdReport {
  for (let i = 0; i <= 100; i++) {
    const report = scoreThreshold(examples, i / 100);
    if (report.falsePositives <= maxFalsePositives) return report;
  }
  return scoreThreshold(examples, 1);
}

/** For choice questions: accuracy of the top label against the human label, above a confidence. */
export function choiceAccuracy<T>(
  examples: readonly { choice: T; confidence: number; truth: T }[],
  minConfidence = 0,
): { accuracy: number; answered: number; abstained: number } {
  const answered = examples.filter((e) => e.confidence >= minConfidence);
  const correct = answered.filter((e) => e.choice === e.truth).length;
  return {
    accuracy: answered.length ? correct / answered.length : 1,
    answered: answered.length,
    abstained: examples.length - answered.length,
  };
}
