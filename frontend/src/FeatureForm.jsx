import { useMemo, useState } from "react";
import { UNITS, binaryOptions, categoryLabel, computeBmi, groupFeatures, labelOf } from "./featureGroups.js";

const round1 = (x) => Math.round(x * 10) / 10;

// A number box that keeps its own text while typing (so "1." can be typed without being wiped),
// and tells the parent only when the text is a valid number. Empty text = "not entered".
// It reads `value` only once, when it is created: the form gives it a new key on Reset / Load example,
// which rebuilds the box with the new value (no effect needed to keep them in sync).
function NumberField({ f, value, onChange, onClear }) {
  const [text, setText] = useState(value === undefined ? "" : String(value));

  const handle = (e) => {
    const t = e.target.value;
    setText(t);
    const n = parseFloat(t);
    if (t.trim() === "") onClear(f.name);
    else if (Number.isFinite(n)) onChange(f.name, n);
  };

  return (
    <input id={f.name} type="number" step="any" value={text} onChange={handle}
           placeholder={`typical ${round1(f.default)}`} />
  );
}

// Yes/No and similar: a dropdown whose first option means "not entered".
function BinaryField({ f, value, onChange, onClear }) {
  return (
    <select id={f.name} value={value ?? ""}
            onChange={(e) => (e.target.value === "" ? onClear(f.name) : onChange(f.name, Number(e.target.value)))}>
      <option value="">not entered</option>
      {binaryOptions(f).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function CategoryField({ f, value, onChange, onClear }) {
  return (
    <select id={f.name} value={value ?? ""}
            onChange={(e) => (e.target.value === "" ? onClear(f.name) : onChange(f.name, e.target.value))}>
      <option value="">not entered</option>
      {f.categories.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
    </select>
  );
}

// One row of the form: label, the right kind of control, and a hint with the range seen in training.
function Field({ f, value, bmi, setField, clearField }) {
  const unit = UNITS[f.name];
  let control;
  if (f.name === "bmi") {
    // derived from weight and height: shown, never typed
    control = <input id="bmi" readOnly value={bmi ?? ""} placeholder="auto" />;
  } else if (f.kind === "numeric") {
    control = <NumberField f={f} value={value} onChange={setField} onClear={clearField} />;
  } else if (f.kind === "binary") {
    control = <BinaryField f={f} value={value} onChange={setField} onClear={clearField} />;
  } else {
    control = <CategoryField f={f} value={value} onChange={setField} onClear={clearField} />;
  }
  return (
    <div className={`field${value !== undefined ? " entered" : ""}`}>
      <label htmlFor={f.name}>
        {labelOf(f.name, f.label)}{unit ? <span className="unit"> ({unit})</span> : null}
      </label>
      {control}
      {f.kind === "numeric" && f.name !== "bmi" && <small>seen {f.min}–{f.max}</small>}
    </div>
  );
}

export default function FeatureForm({ features, touched, setField, clearField, reset, loadExample }) {
  const sections = useMemo(() => groupFeatures(features), [features]);
  const bmi = computeBmi(features, touched);
  const entered = Object.keys(touched).length;
  const [version, setVersion] = useState(0); // bumped on Reset / Load example to rebuild the number boxes

  const onReset = () => { reset(); setVersion((v) => v + 1); };
  const onLoadExample = () => { loadExample(); setVersion((v) => v + 1); };

  return (
    <div>
      <h1>Patient data</h1>
      <p className="hint">
        Only fields you fill in are used. Blank fields are assumed to be typical, and the results show
        how much they matter.
      </p>
      <div className="form-actions">
        <button type="button" onClick={onLoadExample}>Load example</button>
        <button type="button" onClick={onReset} disabled={entered === 0}>Reset</button>
        <span className="count">{entered} of {features.length} entered</span>
      </div>

      {features.length === 0 && <p className="hint">Loading fields…</p>}

      {sections.map((s, i) => {
        const inSection = s.items.filter((f) => touched[f.name] !== undefined).length;
        return (
          <details key={s.title} open={i === 0}>
            <summary>{s.title}{inSection > 0 ? <span className="pill">{inSection}</span> : null}</summary>
            {s.items.map((f) => (
              <Field key={`${f.name}-${version}`} f={f} value={touched[f.name]} bmi={bmi} setField={setField} clearField={clearField} />
            ))}
          </details>
        );
      })}
    </div>
  );
}