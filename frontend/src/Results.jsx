import { formatValue, labelOf } from "./featureGroups.js";
import { riskColor } from "./riskColor.js";
import { plainSummary } from "./summary.js";


const TARGETS = [["cad", "Overall CAD"], ["lad", "LAD"], ["lcx", "LCX"], ["rca", "RCA"]];
const pct = (x) => Math.round(x * 100);

// One prediction: probability, a bar with the cut-off marked, and above/below status.
// `previous` is the prediction before the user's latest edit (or null), used for the change badge.
function RiskCard({ title, pred, previous,assumed, selected, onSelect }) {
  const p = pred.probability;
  const delta = previous ? pct(p) - pct(previous.probability) : 0; // change in percentage points
 
  return (
    <button type="button" className={`card${selected ? " selected" : ""}`} onClick={onSelect}>
      <div className="card-top">
        <span className="card-title">{title}</span>
        <span className={`badge ${pred.above_threshold ? "up" : "down"}`}>
          {pred.above_threshold ? "Above cut-off" : "Below cut-off"}
        </span>
      </div>
      <div className="card-prob" style={{ color: riskColor(p) }}>
        {pct(p)}%
        {delta !== 0 && (
          <span className={`delta ${delta > 0 ? "up" : "down"}`} title="change since your last edit">
            {delta > 0 ? " +" : ""}{delta} pts
          </span>
        )}
      </div>
      <div className="bar">
        <div className="bar-fill" style={{ width: `${pct(p)}%`, background: riskColor(p) }} />
        {/* the tick shows where THIS target's cut-off sits: they differ per target */}
        <div className="bar-tick" style={{ left: `${pct(pred.threshold)}%` }} />
      </div>
      {assumed > 50 && <div className="card-warn"> {Math.round(assumed)}% from assumed values</div>}
      <small>
        cut-off {pct(pred.threshold)}% · {pred.model.toUpperCase()}{pred.calibrated ? " (calibrated)" : ""}
      </small>
    </button>
  );
}


// Why this target got its probability: the entered features, ranked by share of the explanation.
function Explanation({ title,pred, exp, features }) {
  const byName = new Map(features.map((f) => [f.name, f]));
  const assumed = exp.assumed_share_pct;
  const biggest = Math.max(...exp.top_features.map((f) => f.share_pct), 1); // scales the bars
  return (
    <section className="explain">
      <h2>Why {title}?</h2>
      <p className="summary">{plainSummary({ title, pred, exp, features })}</p>
      <div className={`assumed${assumed > 50 ? " high" : ""}`}>
        {assumed}% of this estimate rests on values that were not entered
        {assumed > 50 ? ": interpret with caution" : ""}
      </div>
      {exp.top_features.length === 0 && <p className="hint">None of the entered fields influenced this estimate.</p>}
      {exp.top_features.map((f) => (
        <div className="feat" key={f.feature}>
          <div className="feat-head">
            <span>{labelOf(f.feature, f.label)}: <b>{formatValue(byName.get(f.feature), f.value)}</b></span>
            <span className={f.direction}>{f.direction === "raises" ? "↑" : "↓"} {f.share_pct}%</span>
          </div>
          <div className="feat-bar">
            <div className={`feat-fill ${f.direction}`} style={{ width: `${(f.share_pct / biggest) * 100}%` }} />
          </div>
        </div>
      ))}
      <p className="hint">
        ↑ pushes the estimate towards stenosis, ↓ away from it. Bars are each feature's share of the
        model's explanation (SHAP). These are statistical associations, not causes.
        
      </p>
    </section>
  );
}

// The evaluation numbers from training (out-of-fold, so not flattered by the training data).
// Which features drive a model OVERALL (average over all 303 training patients). The "Why?" panel above is
// about ONE patient; this one is about the model. Bars are shares of the total, so targets compare fairly.
function ImportancePanel({ importance, target }) {
  const list = importance[target];
  if (!list || list.length === 0) return null;
  const title = TARGETS.find(([id]) => id === target)?.[1] ?? target;
  const biggest = Math.max(...list.map((f) => f.share_pct), 1);   // scales the bars
  return (
    <details className="importance">
      <summary>What drives {title} overall</summary>
      {list.slice(0, 8).map((f) => (
        <div className="feat" key={f.feature}>
          <div className="feat-head"><span>{labelOf(f.feature, f.label)}</span><span>{f.share_pct}%</span></div>
          <div className="feat-bar"><div className="feat-fill neutral" style={{ width: `${(f.share_pct / biggest) * 100}%` }} /></div>
        </div>
      ))}
      <p className="hint">
        Share of each feature in the model's decisions, averaged over all 303 patients it was trained on.
        Select a card to switch target.
      </p>
    </details>
  );
}
function MetricsTable({ metrics }) {
  const rows = TARGETS.filter(([id]) => metrics.final[id]);
  return (
    <details className="metrics">
      <summary>Model performance</summary>
      <table>
        <thead><tr><th></th><th>AUC (95% CI)</th><th>Recall</th><th>Prec.</th><th>F1</th><th>Acc.</th></tr></thead>
        <tbody>
          {rows.map(([id, title]) => {
            const m = metrics.final[id];
            return (
              <tr key={id}>
                <td>{title}</td>
                <td>{m.roc_auc.toFixed(2)} ({m.auc_ci95[0].toFixed(2)}–{m.auc_ci95[1].toFixed(2)})</td>
                <td>{m.recall.toFixed(2)}</td><td>{m.precision.toFixed(2)}</td>
                <td>{m.f1.toFixed(2)}</td><td>{m.accuracy.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="hint">
        Nested cross-validation on 303 patients from a single dataset. LCX and RCA are the weakest
        targets. Predictions are for decision support and education only.
      </p>
    </details>
  );
}

export default function Results({ result, status, hasInput, features, metrics, selected, onSelect }) {
  const pred = result?.predict;
  const expl = result?.explain;
  const selectedTitle = TARGETS.find(([id]) => id === selected)?.[1];

  return (
    <div>
      <h1>Results {status.loading && <span className="updating">updating…</span>}</h1>
      {status.error && <div className="error">{status.error}</div>}
      {!hasInput && !status.error && (
        <p className="hint">Enter patient data on the left, or press “Load example”, to see predictions.</p>
        
      )}
      {!hasInput && !status.error && (
        <p className="hint">Enter patient data on the left, or press “Load example”, to see predictions.</p>
      )}
      {hasInput && !pred && !status.error && <p className="hint">Calculating…</p>}

      {pred && (
        <>
          <p className="hint">
            {features.length - pred.n_inputs_filled} of {features.length} fields used.
            {pred.filled_features.length > 0 && (
              <details className="assumed-list">
                <summary>Assumed typical values ({pred.filled_features.length})</summary>
                {pred.filled_features.join(", ")}
              </details>
            )}
          </p>
          {pred.warnings.map((w) => <div className="warn" key={w}>{w}</div>)}
          <div className="cards">
            {TARGETS.map(([id, title]) => (
              <RiskCard key={id} title={title} pred={pred.predictions[id]}
                        assumed={expl?.explanations[id]?.assumed_share_pct}
                        selected={selected === id} onSelect={() => onSelect(selected === id ? null : id)} />
            ))}
          </div>
          {selected && expl?.explanations[selected] && (
             <Explanation title={selectedTitle} pred={pred.predictions[selected]}
                         exp={expl.explanations[selected]} features={features} />
          )}
          {!selected && <p className="hint">Click a card or an artery to see why.</p>}
        </>
      )}

      {metrics && <MetricsTable metrics={metrics} />}
    </div>
  );
}