import { useState } from "react";
import Scene from "./Scene.jsx";
import { VESSELS } from "./anatomy.js";
import { riskColor } from "./riskColor.js";

// The legend bar is the same green -> yellow -> red scale the arteries use.
const GRADIENT = `linear-gradient(to right, ${riskColor(0)}, ${riskColor(0.5)}, ${riskColor(1)})`;

export default function App() {
  // Demo probabilities for Day 5. On Day 6 these come from the API instead of the sliders.
  const [probs, setProbs] = useState({ lad: 0.2, lcx: 0.5, rca: 0.9 });
  const [selected, setSelected] = useState(null); // "lad" | "lcx" | "rca" | null
  const sel = selected ? VESSELS[selected] : null;

  return (
    <div className="app">
      <div className="disclaimer" role="alert">
        ⚠ Decision support / educational use only. Not a substitute for formal diagnostic imaging.
      </div>
      <div className="main">
        <div className="viewer">
          <Scene probs={probs} selected={selected} onSelect={setSelected} />
        </div>
        <aside className="panel">
          <h1>Coronary arteries</h1>

          <section>
            <h2>Demo values <small>(Day 5 only)</small></h2>
            {Object.entries(VESSELS).map(([id, v]) => (
              <label key={id} className="slider">
                <span>{v.name}</span>
                <input
                  type="range" min="0" max="1" step="0.01" value={probs[id]}
                  // functional update: always builds on the latest state
                  onChange={(e) => setProbs((p) => ({ ...p, [id]: parseFloat(e.target.value) }))}
                />
                <span>{Math.round(probs[id] * 100)}%</span>
              </label>
            ))}
            <div className="legend" style={{ background: GRADIENT }} />
            <div className="legend-labels"><span>low risk</span><span>high risk</span></div>
          </section>

          <section>
            <h2>Selected vessel</h2>
            {sel ? (
              <div className="detail">
                <span className="swatch" style={{ background: riskColor(probs[selected]) }} />
                <div>
                  <strong>{sel.name}</strong> · {sel.full}
                  <div>Supplies the {sel.supplies}</div>
                  <div>Probability: {Math.round(probs[selected] * 100)}%</div>
                </div>
              </div>
            ) : (
              <p className="hint">Click an artery on the heart. Drag to rotate, scroll to zoom.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}