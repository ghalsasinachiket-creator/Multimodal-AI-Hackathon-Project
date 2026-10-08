import { useMemo, useState } from "react";
import FeatureForm from "./FeatureForm.jsx";
import Results from "./Results.jsx";
import Scene from "./Scene.jsx";
import ViewControls from "./ViewControls.jsx";
import { NEUTRAL_COLOR, riskColor } from "./riskColor.js";
import { useRisk } from "./useRisk.js";
import { keyFeatureNames } from "./featureGroups.js";


// The legend bar is the same green -> yellow -> red scale the arteries use.
const GRADIENT = `linear-gradient(to right, ${riskColor(0)}, ${riskColor(0.5)}, ${riskColor(1)})`;

export default function App() {
  const risk = useRisk();
  const [selected, setSelected] = useState(null); // "cad" | "lad" | "lcx" | "rca" | null
  const [view, setView] = useState(null);         // { name, nonce }: the latest camera button pressed
  const [layers, setLayers] = useState({ body: true, labels: true, territory: true });
  // The inputs the models rely on most (top 4 of every target), starred in the form.
  const keyFeatures = useMemo(() => keyFeatureNames(risk.importance), [risk.importance]);


  // Probabilities for the 3D arteries. null = no prediction yet, so the arteries stay grey.
  const probs = useMemo(() => {
    const p = risk.result?.predict.predictions;
    return { lad: p?.lad.probability ?? null, lcx: p?.lcx.probability ?? null, rca: p?.rca.probability ?? null };
  }, [risk.result]);

  return (
    <div className="app">
      <div className="disclaimer" role="alert">
        ⚠ Decision support / educational use only. Not a substitute for formal diagnostic imaging.
      </div>
      <div className="main">
        <aside className="side form-panel">
          <FeatureForm features={risk.features} touched={risk.touched} setField={risk.setField} keyFeatures={keyFeatures}
                       clearField={risk.clearField} reset={risk.reset} loadExample={risk.loadExample} />
        </aside>

        <div className="viewer">
          <Scene probs={probs} selected={selected} onSelect={setSelected} view={view} layers={layers} />
          <ViewControls layers={layers} onLayers={setLayers}
                        onView={(name) => setView({ name, nonce: Date.now() })} />
          <div className="legend-overlay">
            <div className="legend" style={{ background: GRADIENT }} />
            <div className="legend-labels"><span>low risk</span><span>high risk</span></div>
            {!risk.result && (
              <div className="legend-none"><i style={{ background: NEUTRAL_COLOR }} /> no prediction yet</div>
            )}
          </div>
        </div>

        <aside className="side panel">
          <Results result={risk.result} status={risk.status} hasInput={risk.hasInput} features={risk.features}
                   metrics={risk.metrics} selected={selected} importance={risk.importance} onSelect={setSelected} />
        </aside>
      </div>
    </div>
  );
}