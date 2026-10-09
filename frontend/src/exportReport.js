export function buildReport({
  result,
  referenceProfile,
  touched,
  features,
  selected,
  metrics,
}) {
  const prediction = result?.predict;
  const explanation = result?.explain;

  return {
    title: "CAD Risk 3D decision-support summary",
    generated_at: new Date().toISOString(),

    inputs: {
      entered: touched,
      assumed_fields: prediction?.filled_features ?? [],
      total_fields: features.length,
      entered_count: prediction
        ? features.length - prediction.n_inputs_filled
        : Object.keys(touched).length,
    },

    predictions: prediction?.predictions ?? null,

    explanation:
      selected && explanation?.explanations?.[selected]
        ? {
            target: selected,
            details: explanation.explanations[selected],
          }
        : null,

    reference_profile: referenceProfile ?? null,
    model_performance: metrics?.final ?? null,

    disclaimers: [
      "This is an educational decision-support estimate, not a diagnosis.",
      "SHAP values describe statistical associations, not causes.",
      "Blank fields may be filled with typical values from the training cohort.",
      "Cohort comparisons describe the training dataset and are not clinical targets.",
    ],
  };
}

export function downloadJson(
  data,
  filename = "cad-risk-decision-support-summary.json",
) {
  const blob = new Blob(
    [JSON.stringify(data, null, 2)],
    { type: "application/json" },
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}