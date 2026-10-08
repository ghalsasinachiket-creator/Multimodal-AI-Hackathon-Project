import { useEffect, useMemo, useState } from "react";
import { API_URL, explain, getFeatures, getImportance, getMetrics, predict } from "./api.js";
import { EXAMPLE_PATIENT, buildPayload } from "./featureGroups.js";

// A fetch that never reached the server throws TypeError: explain that in plain words.
const friendly = (err) =>
  err instanceof TypeError
    ? `Cannot reach the API at ${API_URL}. Is the backend running? (uvicorn backend.main:app --port 8000)`
    : err.message;

// All data flow lives here: form definition, what the user touched, and the prediction for it.
export function useRisk() {
  const [features, setFeatures] = useState([]);   // form definition from GET /features
  const [metrics, setMetrics] = useState(null);   // evaluation numbers from GET /metrics
  const [importance, setImportance] = useState(null); // which features drive each model overall, from GET /importance
  const [touched, setTouched] = useState({});     // ONLY the fields the user changed
  const [result, setResult] = useState(null);     // { predict, explain } for the current input
  const [status, setStatus] = useState({ loading: false, error: null });

  // Load the form definition and the metrics once, when the page opens.
  useEffect(() => {
    getFeatures().then(setFeatures).catch((e) => setStatus({ loading: false, error: friendly(e) }));
    getMetrics().then(setMetrics).catch(() => {}); // metrics are optional: the app works without them
    getImportance().then(setImportance).catch(() => {}); // so is the importance panel
  }, []);

  const payload = useMemo(() => buildPayload(features, touched), [features, touched]);
  const hasInput = Object.keys(payload).length > 0;

  // Ask the API for a prediction 0.4 s after the user stops typing.
  useEffect(() => {
    if (features.length === 0) return;              // wait for the form definition (BMI needs the defaults)
    if (!hasInput) return;                          // nothing entered: nothing to ask the API

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus({ loading: true, error: null });
      try {
        // the two requests are independent, so run them side by side
        const [p, e] = await Promise.all([predict(payload, controller.signal), explain(payload, controller.signal)]);
        // keep the previous predictions so the cards can show "+4 points since your last change"
        setResult((prev) => ({ predict: p, explain: e, previous: prev?.predict.predictions ?? null }));
        setStatus({ loading: false, error: null });
      } catch (err) {
        if (err.name === "AbortError") return;      // a newer request replaced this one: ignore
        setStatus({ loading: false, error: friendly(err) }); // keep showing the last good result
      }
    }, 400);

    // Cleanup runs before the next effect: cancel the timer and any request still in flight.
    return () => { clearTimeout(timer); controller.abort(); };
  }, [features.length, payload, hasInput]);

  return {
    features, metrics, importance, touched, status, hasInput,
    result: hasInput ? result : null,               // nothing entered -> show no prediction
    setField: (name, value) => setTouched((t) => ({ ...t, [name]: value })),
    clearField: (name) => setTouched(({ [name]: _removed, ...rest }) => rest),
    // a reset or a loaded example is a NEW patient: forget the old result so no misleading change is shown
    reset: () => { setTouched({}); setResult(null); },
    loadExample: () => { setTouched({ ...EXAMPLE_PATIENT }); setResult(null); },
  };
}