import { VIEWS } from "./views.js";

// Buttons that move the camera, and switches for what is drawn. Purely presentational:
// the parent decides what actually happens.
export default function ViewControls({ onView, layers, onLayers }) {
  return (
    <div className="view-controls">
      <div className="view-buttons">
        {Object.entries(VIEWS).map(([name, v]) => (
          <button key={name} type="button" onClick={() => onView(name)}>{v.label}</button>
        ))}
      </div>
      <label>
        <input type="checkbox" checked={layers.body} onChange={(e) => onLayers({ ...layers, body: e.target.checked })} />
        Torso &amp; lungs
      </label>
      <label>
        <input type="checkbox" checked={layers.labels} onChange={(e) => onLayers({ ...layers, labels: e.target.checked })} />
        Labels
      </label>
    </div>
  );
}