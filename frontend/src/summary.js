import { formatValue, labelOf } from "./featureGroups.js";

const pct = (x) => Math.round(x * 100);
const MIN_SHARE = 5; // a factor must account for at least 5% of the explanation to be called "main"

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

  // Only factors with a real share are named: a feature worth 1% is noise, not a "main factor".
  const strong = (direction) =>
    exp.top_features.filter((f) => f.direction === direction && f.share_pct >= MIN_SHARE).slice(0, 3);
  const raises = strong("raises");
  const lowers = strong("lowers");

  const parts = [
    `${title}: ${pct(pred.probability)}%, ${pred.above_threshold ? "above" : "below"} its cut-off of ${pct(pred.threshold)}%.`,
  ];
  // Lead with what explains the outcome: raising factors if it is above the cut-off, otherwise the ones keeping it low.
  const sentences = pred.above_threshold
    ? [[raises, "Main factors raising it"], [lowers, "Factors lowering it"]]
    : [[lowers, "Main factors keeping it low"], [raises, "Factors pushing it up"]];
  for (const [list, lead] of sentences) {
    if (list.length) parts.push(`${lead}: ${joinList(list.map(describe))}.`);
  }
  if (!raises.length && !lowers.length) parts.push("None of the entered values moved this estimate noticeably.");
  if (exp.assumed_share_pct > 50) {
    parts.push(`${exp.assumed_share_pct}% of this estimate rests on values that were not entered, so treat it with caution.`);
  }
  parts.push("This describes statistical associations in the training data, not a diagnosis.");
  return parts.join(" ");
}