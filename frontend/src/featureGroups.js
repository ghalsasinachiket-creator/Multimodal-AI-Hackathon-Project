// Pure helpers for the input form: grouping, friendly labels, BMI and the request payload.
// Kept free of React so they can be unit-tested (see form.test.js).

// Sections of the form. A feature that is not listed here lands in "Other", so features added
// to the model later appear in the form automatically.
export const GROUPS = [
  { title: "Demographics & body", names: ["age", "sex", "weight", "length", "bmi"] },
  { title: "History & risk factors", names: ["dm", "htn", "current_smoker", "ex_smoker", "fh", "obesity", "crf", "cva", "airway_disease", "thyroid_disease", "chf", "dlp"] },
  { title: "Examination", names: ["bp", "pr", "edema", "weak_peripheral_pulse", "lung_rales", "systolic_murmur", "diastolic_murmur"] },
  { title: "Symptoms", names: ["typical_chest_pain", "atypical", "nonanginal", "exertional_cp", "dyspnea", "function_class", "lowth_ang"] },
  { title: "ECG", names: ["q_wave", "st_elevation", "st_depression", "tinversion", "lvh", "poor_r_progression", "bbb"] },
  { title: "Laboratory", names: ["fbs", "cr", "tg", "ldl", "hdl", "bun", "esr", "hb", "k", "na", "wbc", "lymph", "neut", "plt"] },
  { title: "Echocardiography", names: ["ef_tte", "region_rwma", "vhd"] },
];

// Readable names for the cryptic dataset columns (anything missing falls back to the API's label).
export const LABELS = {
  dm: "Diabetes mellitus", htn: "Hypertension", fh: "Family history of CAD", crf: "Chronic renal failure",
  cva: "Cerebrovascular accident", chf: "Congestive heart failure", dlp: "Dyslipidemia",
  bp: "Blood pressure", pr: "Pulse rate", bmi: "BMI (calculated)", length: "Height",
  current_smoker: "Current smoker", ex_smoker: "Ex-smoker", airway_disease: "Airway disease",
  thyroid_disease: "Thyroid disease", weak_peripheral_pulse: "Weak peripheral pulse",
  lung_rales: "Lung rales", systolic_murmur: "Systolic murmur", diastolic_murmur: "Diastolic murmur",
  typical_chest_pain: "Typical chest pain", atypical: "Atypical chest pain", nonanginal: "Non-anginal chest pain",
  exertional_cp: "Exertional chest pain", lowth_ang: "Low-threshold angina", function_class: "Functional class",
  q_wave: "Q wave", st_elevation: "ST elevation", st_depression: "ST depression", tinversion: "T-wave inversion",
  lvh: "Left ventricular hypertrophy", poor_r_progression: "Poor R-wave progression", bbb: "Bundle branch block",
  fbs: "Fasting blood sugar", cr: "Creatinine", tg: "Triglycerides", ldl: "LDL cholesterol", hdl: "HDL cholesterol",
  bun: "Blood urea nitrogen", esr: "ESR", hb: "Haemoglobin", k: "Potassium", na: "Sodium", wbc: "White cell count",
  lymph: "Lymphocytes", neut: "Neutrophils", plt: "Platelets", ef_tte: "Ejection fraction",
  region_rwma: "Wall-motion abnormality region", vhd: "Valvular heart disease",
};

// Units only where we are sure of them.
export const UNITS = { age: "years", weight: "kg", length: "cm", bp: "mmHg", pr: "bpm", ef_tte: "%", bmi: "kg/m²" };

// A demo patient (the same values used when testing the API).
export const EXAMPLE_PATIENT = {
  age: 63, sex: 1, bp: 140, pr: 80, dm: 1, htn: 1, typical_chest_pain: 1,
  st_depression: 1, tinversion: 1, ef_tte: 45, region_rwma: 2, fbs: 130, ldl: 150,
};

export const labelOf = (name, fallback) => LABELS[name] ?? fallback ?? name;

// Split the feature list (from GET /features) into form sections, keeping the order above.
export function groupFeatures(features) {
  const byName = new Map(features.map((f) => [f.name, f]));
  const used = new Set();
  const sections = GROUPS.map((g) => {
    const items = g.names.filter((n) => byName.has(n)).map((n) => { used.add(n); return byName.get(n); });
    return { title: g.title, items };
  });
  const other = features.filter((f) => !used.has(f.name));
  if (other.length) sections.push({ title: "Other", items: other });
  return sections.filter((s) => s.items.length > 0);
}

// Dataset codes -> words. "Fmale" is how the dataset spells female.
const WORDS = { y: "Yes", n: "No", 1: "Yes", 0: "No", male: "Male", fmale: "Female", female: "Female" };
export const optionLabel = (key) => WORDS[String(key).toLowerCase()] ?? key;
export const categoryLabel = (c) => (c === "N" ? "None / normal" : c);

// Binary feature -> [{value: 0, label: "No"}, {value: 1, label: "Yes"}] from the API's mapping {"N": 0, "Y": 1}.
export function binaryOptions(feature) {
  return Object.entries(feature.mapping)
    .map(([key, value]) => ({ value, label: optionLabel(key) }))
    .sort((a, b) => a.value - b.value);
}

// How to show a value the user entered (used in the explanation list).
export function formatValue(feature, value) {
  if (value === null || value === undefined || !feature) return "";
  if (feature.kind === "binary") return binaryOptions(feature).find((o) => o.value === Number(value))?.label ?? String(value);
  if (feature.kind === "categorical") return categoryLabel(String(value));
  return String(value);
}

// BMI is derived from weight and height so the three can never contradict each other.
// If only one of them was entered, the other one's typical value is used.
export function computeBmi(features, touched) {
  if (touched.weight === undefined && touched.length === undefined) return undefined;
  const typical = (name) => features.find((f) => f.name === name)?.default;
  const weight = touched.weight ?? typical("weight");
  const height = touched.length ?? typical("length");
  if (!(weight > 0) || !(height > 0)) return undefined;
  return Math.round((weight / (height / 100) ** 2) * 10) / 10;
}

// What we send to the API: ONLY fields the user touched (+ the derived BMI). Everything else is
// left out so the model's assumed values stay flagged as assumed.
export function buildPayload(features, touched) {
  const payload = { ...touched };
  delete payload.bmi; // the user never types BMI
  const bmi = computeBmi(features, touched);
  if (bmi !== undefined) payload.bmi = bmi;
  return payload;
}