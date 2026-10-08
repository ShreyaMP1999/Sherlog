"use strict";
let incidents = [], selected = null, report = null;
const $ = id => document.getElementById(id);
const titleCase = value => value.replaceAll("_", " ");
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
    button.append(node("span", incident.id), node("strong", incident.title));
    button.addEventListener("click", () => select(incident));
    $("incidents").append(button);
  }
}
function select(incident) {
  selected = incident; report = null;
  $("title").textContent = incident.title;
  $("alert").textContent = incident.alert;
  $("empty-alert").textContent = incident.alert;
  $("result").hidden = true; $("empty").hidden = false;
  $("export").disabled = true; $("error").hidden = true;
  renderList();
}
function renderReport(value) {
  report = value;
  $("empty").hidden = true; $("result").hidden = false;
  $("outcome").textContent = report.status;
  $("support").textContent = report.support;
  $("calls").textContent = report.tool_calls + " / 6";
  $("elapsed").textContent = report.duration_ms.toFixed(1) + " ms";
  $("cause").textContent = titleCase(report.cause);
  $("summary").textContent = report.summary;
  $("limitations").textContent = report.limitations;
  $("citations").replaceChildren(...report.citations.map(ref => node("span", ref, "citation")));
  $("actions").replaceChildren(...report.actions.map(action => node("li", action)));
  $("candidates").textContent = report.candidates.length > 1 ? "Supported hypotheses: " + report.candidates.map(item => item.title).join("; ") : "";
  $("metrics").replaceChildren();
  for (const row of report.evidence.filter(row => row.source === "inspect_metrics")) {
    const metric = node("div", undefined, "metric"), top = node("div", undefined, "metric-top");
    top.append(node("span", titleCase(row.name)), node("strong", `${row.before} → ${row.after}`));
    const track = node("div", undefined, "metric-track");
    const scale = row.name.endsWith("_pct") ? 100 : Math.max(row.before, row.after, 5000);
    const after = node("div", undefined, "metric-bar"), before = node("div", undefined, "metric-before");
    after.style.width = Math.min(100, row.after / scale * 100) + "%";
    before.style.width = Math.min(100, row.before / scale * 100) + "%";
    track.append(after, before); metric.append(top, track); $("metrics").append(metric);
  }
  $("evidence").replaceChildren();
  for (const row of report.evidence) {
    const tr = node("tr");
    const observation = row.message ?? row.description ?? row.title ?? `${row.name}: ${row.before} → ${row.after}`;
    tr.append(node("td", row.id), node("td", titleCase(row.source)), node("td", observation));
    $("evidence").append(tr);
  }
  $("trace").replaceChildren();
  for (const [index, step] of report.trace.entries()) {
    const li = node("li");
    li.append(node("strong", `${index + 1}. ${step.tool}`), node("p", step.reason),
      node("small", `${step.ok ? "Success" : "Failed"} · ${step.records} records · ${step.duration_ms} ms · ${JSON.stringify(step.arguments)}`));
    if (step.error) li.append(node("p", step.error));
    $("trace").append(li);
  }
  $("export").disabled = false; showTab("report");
}
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
  $("investigate").disabled = true; $("mode").disabled = true;
  $("loading").hidden = false; $("error").hidden = true;
  $("result").hidden = true; $("empty").hidden = true; $("export").disabled = true;
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
