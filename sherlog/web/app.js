"use strict";
let incidents = [], selected = null, report = null;
const $ = id => document.getElementById(id);
const titleCase = value => value.replaceAll("_", " ");
let trailFrame = null, flowUntil = 0, evidenceSource = null;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function showTab(name) {
  for (const tab of document.querySelectorAll("[data-tab]")) {
    const active = tab.dataset.tab === name;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    $(tab.dataset.tab + "-panel").hidden = !active;
  }
}
function renderList() {
  const query = $("search").value.toLowerCase();
  $("incidents").replaceChildren();
  for (const incident of incidents.filter(item => (item.title + item.id).toLowerCase().includes(query))) {
    const button = node("button", undefined, "incident");
    button.setAttribute("aria-current", String(selected?.id === incident.id));
    const serial = String(incidents.indexOf(incident) + 1).padStart(2, "0");
    const copy = node("div", undefined, "incident-copy");
    copy.append(node("small", incident.id), node("strong", incident.title));
    const arrow = node("i", undefined, "incident-arrow"); arrow.dataset.lucide = "arrow-up-right";
    button.append(node("span", serial, "incident-number"), copy, arrow);
    button.addEventListener("click", () => select(incident));
    $("incidents").append(button);
  }
  if (!$("incidents").children.length) $("incidents").append(node("p", "No matching cases.", "no-matches"));
  lucide.createIcons();
}
function select(incident) {
  selected = incident; report = null;
  evidenceSource = null;
  const serial = String(incidents.indexOf(incident) + 1).padStart(3, "0");
  $("case-number").textContent = "CASE FILE / " + serial;
  $("pending-number").textContent = serial;
  $("case-state").textContent = "OPEN INVESTIGATION";
  $("signal-label").textContent = incident.id;
  $("title").textContent = incident.title;
  $("alert").textContent = incident.alert;
  $("empty-alert").textContent = incident.alert;
  $("result").hidden = true; $("empty").hidden = false;
  $("export").disabled = true; $("error").hidden = true;
  renderList();
  updateTrail();
}
function renderReport(value) {
  report = value;
  evidenceSource = null;
  $("case-state").textContent = report.status.toUpperCase();
  $("empty").hidden = true; $("result").hidden = false;
  $("outcome").textContent = report.status;
  $("support").textContent = report.support;
  $("calls").textContent = report.tool_calls + " / 6";
  $("elapsed").textContent = report.duration_ms.toFixed(1) + " ms";
  $("cause").textContent = titleCase(report.cause);
  $("summary").textContent = report.summary;
  $("limitations").textContent = report.limitations;
  $("citations").replaceChildren(...report.citations.map(ref => {
    const button = node("button", ref, "citation");
    button.title = "Open evidence " + ref;
    button.addEventListener("click", () => {
      evidenceSource = null; renderEvidence(); showTab("evidence");
      const row = [...$("evidence").children].find(item => item.dataset.reference === ref);
      row?.classList.add("is-cited");
      row?.scrollIntoView({behavior: reducedMotion.matches ? "instant" : "smooth", block: "nearest"});
      $("tab-evidence").focus();
    });
    return button;
  }));
  $("actions").replaceChildren(...report.actions.map(action => node("li", action)));
  $("candidates").textContent = report.candidates.length > 1 ? "Supported hypotheses: " + report.candidates.map(item => item.title).join("; ") : "";
  $("metrics").replaceChildren();
  for (const row of report.evidence.filter(row => row.source === "inspect_metrics")) {
    const metric = node("div", undefined, "metric"), top = node("div", undefined, "metric-top");
    top.append(node("span", titleCase(row.name)), node("strong", `${row.before} → ${row.after}`));
    const track = node("div", undefined, "metric-track");
    const scale = row.name.endsWith("_pct") ? 100 : Math.max(row.before, row.after, 5000);
    const after = node("div", undefined, "metric-bar"), before = node("div", undefined, "metric-before");
    if (row.after > row.before * 1.5 && row.after > 5) after.style.backgroundColor = "#c96d59";
    after.style.width = Math.min(100, row.after / scale * 100) + "%";
    before.style.width = Math.min(100, row.before / scale * 100) + "%";
    track.append(after, before); metric.append(top, track); $("metrics").append(metric);
  }
  renderEvidence();
  $("trace").replaceChildren();
  for (const [index, step] of report.trace.entries()) {
    const li = node("li");
    li.append(node("strong", `${index + 1}. ${step.tool}`), node("p", step.reason),
      node("small", `${step.ok ? "Success" : "Failed"} · ${step.records} records · ${step.duration_ms} ms · ${JSON.stringify(step.arguments)}`));
    if (step.error) li.append(node("p", step.error));
    $("trace").append(li);
  }
  $("export").disabled = false; showTab("report");
  updateTrail();
}
function renderEvidence() {
  $("evidence").replaceChildren();
  $("clear-filter").hidden = !evidenceSource;
  for (const row of report.evidence.filter(row => !evidenceSource || row.source === evidenceSource)) {
    const tr = node("tr");
    tr.dataset.reference = row.id;
    const observation = row.message ?? row.description ?? row.title ?? `${row.name}: ${row.before} → ${row.after}`;
    tr.append(node("td", row.id), node("td", titleCase(row.source)), node("td", observation));
    $("evidence").append(tr);
  }
  if (!$("evidence").children.length) {
    const td = node("td", "No records returned by this tool."); td.colSpan = 3;
    const tr = node("tr"); tr.append(td); $("evidence").append(tr);
  }
}
function updateTrail() {
  $("trail-map").dataset.ready = String(Boolean(report));
  $("trail-state").textContent = report ? "RECORDED TOOL TRACE" : "AWAITING OBSERVATIONS";
  $("verdict-label").textContent = report ? titleCase(report.cause) : "Undetermined";
  $("verdict-detail").textContent = report ? report.support + " evidence" : "Evidence pending";
  $("trail-verdict").dataset.state = report?.status ?? "pending";
  $("trail-verdict").disabled = !report;
  for (const button of document.querySelectorAll(".trail-tool")) {
    const steps = report?.trace.filter(step => step.tool === button.dataset.source) ?? [];
    const step = steps.find(item => item.ok) ?? steps.at(-1);
    button.dataset.state = step ? (step.ok ? "complete" : "failed") : "pending";
    button.querySelector(".tool-count").textContent = step ? String(step.records) : "--";
    button.disabled = !step;
  }
  flowUntil = report ? performance.now() + 1600 : 0;
  scheduleTrail();
}
function scheduleTrail() {
  cancelAnimationFrame(trailFrame);
  trailFrame = requestAnimationFrame(drawTrail);
}
function drawTrail(now) {
  const map = $("trail-map"), canvas = $("trail-canvas"), bounds = map.getBoundingClientRect();
  const ratio = Math.min(devicePixelRatio || 1, 2), ctx = canvas.getContext("2d");
  const width = Math.round(bounds.width * ratio), height = Math.round(bounds.height * ratio);
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, bounds.width, bounds.height);
  const point = (element, right) => { const rect = element.getBoundingClientRect(); return {
    x: (right ? rect.right : rect.left) - bounds.left, y: rect.top + rect.height / 2 - bounds.top}; };
  const start = point($("trail-alert"), true), end = point($("trail-verdict"), false);
  const moving = !reducedMotion.matches && (document.body.classList.contains("is-investigating") || now < flowUntil);
  ctx.lineWidth = 1; ctx.lineDashOffset = moving ? -now / 45 : 0;
  for (const button of document.querySelectorAll(".trail-tool")) {
    const left = point(button, false), right = point(button, true);
    ctx.strokeStyle = button.dataset.state === "complete" ? "#8ba867" : button.dataset.state === "failed" ? "#ba504b" : "#c5cdb8";
    ctx.setLineDash(moving ? [3, 5] : []);
    for (const [a, b] of [[start, left], [right, end]]) {
      const middle = (a.x + b.x) / 2;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.bezierCurveTo(middle, a.y, middle, b.y, b.x, b.y); ctx.stroke();
    }
  }
  if (moving) trailFrame = requestAnimationFrame(drawTrail);
}
for (const button of document.querySelectorAll(".trail-tool")) {
  button.addEventListener("click", () => {
    if (!report) return;
    evidenceSource = button.dataset.source; renderEvidence(); showTab("evidence");
    $("tab-evidence").focus();
    $("evidence-panel").scrollIntoView({behavior: reducedMotion.matches ? "instant" : "smooth", block: "nearest"});
  });
}
$("clear-filter").addEventListener("click", () => { evidenceSource = null; renderEvidence(); });
$("trail-verdict").addEventListener("click", () => { if (report) { showTab("report"); $("tab-report").focus(); } });
new ResizeObserver(scheduleTrail).observe($("trail-map"));
reducedMotion.addEventListener("change", scheduleTrail);
lucide.createIcons();
$("search").addEventListener("input", renderList);
for (const tab of document.querySelectorAll("[data-tab]")) {
  tab.addEventListener("click", () => showTab(tab.dataset.tab));
  tab.addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...document.querySelectorAll("[data-tab]")];
    const index = tabs.indexOf(tab);
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 :
      (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    showTab(tabs[next].dataset.tab); tabs[next].focus();
  });
}
$("investigate").addEventListener("click", async () => {
  if (!selected) return;
  const incidentId = selected.id;
  report = null; evidenceSource = null; updateTrail();
  $("investigate").disabled = true; $("mode").disabled = true;
  $("loading").hidden = false; $("error").hidden = true;
  $("result").hidden = true; $("empty").hidden = true; $("export").disabled = true;
  document.body.classList.add("is-investigating");
  $("case-state").textContent = "COLLECTING EVIDENCE";
  $("trail-state").textContent = "COLLECTING OBSERVATIONS";
  scheduleTrail();
  try {
    const response = await fetch("/api/investigate", {method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({incident: incidentId, mode: $("mode").value})});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Investigation failed");
    if (selected.id === incidentId) renderReport(data);
  } catch (error) {
    if (selected.id === incidentId) {
      $("error").textContent = error.message; $("error").hidden = false;
      $("empty").hidden = false;
    }
  } finally {
    $("loading").hidden = true; $("investigate").disabled = false; $("mode").disabled = false;
    document.body.classList.remove("is-investigating");
    if (!report) { $("case-state").textContent = "OPEN INVESTIGATION"; updateTrail(); }
  }
});
$("export").addEventListener("click", () => {
  if (!report) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], {type: "application/json"}));
  const anchor = node("a"); anchor.href = url; anchor.download = `sherlog-${report.incident_id}.json`;
  anchor.click(); URL.revokeObjectURL(url);
});
(async () => {
  try {
    const response = await fetch("/api/incidents");
    if (!response.ok) throw new Error("Unable to load incidents");
    incidents = await response.json(); $("case-count").textContent = incidents.length;
    select(incidents[0]); showTab("report");
  } catch (error) {
    $("error").textContent = error.message; $("error").hidden = false;
  }
})();
