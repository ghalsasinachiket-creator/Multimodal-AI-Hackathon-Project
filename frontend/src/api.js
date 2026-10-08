// Thin wrappers around the FastAPI backend. Components never call fetch() directly.
// To point at another server, create frontend/.env with: VITE_API_URL=http://host:port
export const API_URL = import.meta.env?.VITE_API_URL ?? "http://localhost:8000";

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, options);
  if (!res.ok) {
    // the API explains validation problems as {"detail": "..."}: pass that text on to the user
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch { /* body was not JSON: keep the status text */ }
    throw new Error(detail);
  }
  return res.json();
}

const post = (path, features, signal) =>
  request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ features }), // the API expects {"features": {...}}
    signal,                              // lets us cancel a request that has been superseded
  });

export const getFeatures = () => request("/features");
export const getMetrics = () => request("/metrics");
export const getImportance = () => request("/importance");
export const predict = (features, signal) => post("/predict", features, signal);
// entered_only=true hides values we assumed; top_k=8 keeps the list short
export const explain = (features, signal) => post("/explain?top_k=8&entered_only=true", features, signal);