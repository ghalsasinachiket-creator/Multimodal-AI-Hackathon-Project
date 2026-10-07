import { formatValue, labelOf } from "./featureGroups.js";

const pct = (x) => Math.round(x * 100);

// "a, b and c"
const joinList = (items) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

// A few plain sentences for ONE target, written only from numbers the API already returned
// (nothing is invented here, so the text can never disagree with the cards and bars).
//   pred = { probability, threshold, above_threshold }   exp = { top_features, assumed_share_pct }
export function plainSummary({ title, pred, exp, features }) {
  const byName = new Map(features.map((f) => [f.name, f]));
  const describe = (f) => {
    const value = formatValue(byName.get(f.feature), f.value);
    return value ? `${labelOf(f.feature, f.label)} (${value})` : labelOf(f.feature, f.label);
  };

  const raises = exp.top_features.filter((f) => f.direction === "raises").slice(0, 3);
  const lowers = exp.top_features.filter((f) => f.direction === "lowers").slice(0, 2);

  const parts = [
    `${title}: ${pct(pred.probability)}%, ${pred.above_threshold ? "above" : "below"} its cut-off of ${pct(pred.threshold)}%.`,
  ];
  if (raises.length) parts.push(`Main factors raising it: ${joinList(raises.map(describe))}.`);
  if (lowers.length) parts.push(`Factors lowering it: ${joinList(lowers.map(describe))}.`);
  if (!raises.length && !lowers.length) parts.push("None of the entered values moved this estimate noticeably.");
  if (exp.assumed_share_pct > 50) {
    parts.push(`${exp.assumed_share_pct}% of this estimate rests on values that were not entered, so treat it with caution.`);
  }
  parts.push("This describes statistical associations in the training data, not a diagnosis.");
  return parts.join(" ");
}