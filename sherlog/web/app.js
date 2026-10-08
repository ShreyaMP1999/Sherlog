"use strict";
const $ = id => document.getElementById(id);
const sources = {all:"All evidence",search_logs:"Logs",inspect_metrics:"Metrics",deployment_history:"Deployments",search_runbooks:"Runbooks"};
const pretty = value => String(value).replaceAll("_", " ");
const pct = value => (value * 100).toFixed(1).replace(/\.0$/, "") + "%";
const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
function read(key, fallback) { try { return JSON.parse(localStorage.getItem("sherlog:" + key)) ?? fallback; } catch { return fallback; } }
const saved = read("reports", {}), reports = saved && !Array.isArray(saved) && typeof saved === "object" ? saved : {};
const pinData = read("pins", []), pins = new Set(Array.isArray(pinData) ? pinData : []);
const historyData = read("history", []), history = Array.isArray(historyData) ? historyData : [];
const prefs = Object.assign({mode:"offline",budget:6,motion:false}, read("preferences", {}));
if (!["offline","ollama"].includes(prefs.mode)) prefs.mode = "offline";
if (!Number.isInteger(prefs.budget) || prefs.budget < 1 || prefs.budget > 12) prefs.budget = 6;
let incidents = [], runbooks = [], evaluation = null, selected = null, report = null;
let page = "cases", scope = "all", layout = "grid", evidenceSource = "all", highlightRef = null, running = false, runningId = null;
let trailFrame, flowUntil = 0, toastTimer;
const reducedMotion = () => prefs.motion || motionPreference.matches;
function node(tag, text, className) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; }
function icon(name) { const n = node("i"); n.dataset.lucide = name; return n; }
function icons() { lucide.createIcons(); }
function save(key, data) { try { localStorage.setItem("sherlog:" + key, JSON.stringify(data)); } catch { toast("Device storage is unavailable. Changes remain in this session."); } }
function toast(text) { $("toast").textContent = text; $("toast").hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $("toast").hidden = true; }, 3500); }
function error(text) { $("error").textContent = text; $("error").hidden = !text; }
async function api(path, data) { const response = await fetch(path, data === undefined ? {} : {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)}); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Request failed"); return result; }
function severity(incident) { const rate = incident.metrics.error_rate_pct[1]; return rate >= 10 ? "critical" : rate >= 1 ? "elevated" : "normal"; }
function tone(index) { return ["coral","teal","blue","gold"][index % 4]; }
function caseUrl(id) { return "#/case/" + encodeURIComponent(id); }
function vaultUrl(id, source = "all", ref = "") { return "#/evidence?case=" + encodeURIComponent(id) + "&source=" + encodeURIComponent(source) + (ref ? "&ref=" + encodeURIComponent(ref) : ""); }
function pinCase(id) { pins.has(id) ? pins.delete(id) : pins.add(id); save("pins", [...pins]); renderCases(); renderPins(); if (selected) updatePinButton(); toast(pins.has(id) ? "Case pinned" : "Case unpinned"); }
function updatePinButton() { $("detail-pin").classList.toggle("is-pinned", pins.has(selected.id)); $("detail-pin").setAttribute("aria-pressed", String(pins.has(selected.id))); $("detail-pin").title = pins.has(selected.id) ? "Unpin case" : "Pin case"; }
function renderPins() {
  $("sidebar-pins").replaceChildren();
  for (const incident of incidents.filter(item => pins.has(item.id))) { const a = node("a", undefined, "pinned-case"); a.href = caseUrl(incident.id); a.append(icon("bookmark"),node("span",incident.title)); $("sidebar-pins").append(a); }
  if (!$("sidebar-pins").children.length) $("sidebar-pins").append(node("span", "No pinned cases", "muted")); icons();
}
function makeSparkline(values, color) {
  const canvas = node("canvas", undefined, "sparkline"); canvas.width = 160; canvas.height = 38;
  canvas.setAttribute("aria-label", "Error rate: " + values[0] + "% before, " + values[1] + "% after"); canvas.setAttribute("role","img");
  const ctx = canvas.getContext("2d"), max = Math.max(...values, 1), points = [[7,31-values[0]/max*24],[151,31-values[1]/max*24]];
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(...points[0]); ctx.lineTo(...points[1]); ctx.stroke();
  for (const [x,y] of points) { ctx.beginPath(); ctx.arc(x,y,3,0,2*Math.PI); ctx.fillStyle=color; ctx.fill(); } return canvas;
}
function renderCases() {
  const query = $("case-search").value.toLowerCase(), filter = $("severity-filter").value;
  const filtered = incidents.filter(item => (item.title + item.id).toLowerCase().includes(query) && (filter === "all" || severity(item) === filter) && (scope !== "pinned" || pins.has(item.id)) && (scope !== "investigated" || reports[item.id]));
  $("case-room-summary").textContent = `${incidents.length} synthetic incidents / checkout service`;
  $("total-cases").textContent = incidents.length; $("total-runs").textContent = incidents.filter(item => reports[item.id]).length;
  $("critical-cases").textContent = incidents.filter(item => severity(item) === "critical").length; $("total-pins").textContent = incidents.filter(item => pins.has(item.id)).length;
  $("visible-cases").textContent = `${filtered.length} CASE FILES`; $("case-grid").className = "case-grid" + (layout === "list" ? " list-layout" : "");
  $("case-grid").replaceChildren();
  for (const incident of filtered) {
    const index = incidents.indexOf(incident), article = node("article", undefined, "case-card " + tone(index)); article.style.animationDelay = Math.min(index,5)*35 + "ms";
    const top = node("div", undefined, "card-top"), number = node("span", "CASE / " + String(index+1).padStart(3,"0"), "case-serial");
    const pin = node("button",undefined,"icon-button card-pin" + (pins.has(incident.id) ? " is-pinned" : "")); pin.title = pins.has(incident.id) ? "Unpin " + incident.title : "Pin " + incident.title; pin.setAttribute("aria-label",pin.title); pin.setAttribute("aria-pressed",String(pins.has(incident.id))); pin.append(icon("bookmark")); pin.addEventListener("click",()=>pinCase(incident.id)); top.append(number,pin);
    const heading = node("h2"), link = node("a", incident.title); link.href=caseUrl(incident.id); heading.append(link);
    const chart = node("div",undefined,"card-signal"); const current = node("div"); current.append(node("strong",incident.metrics.error_rate_pct[1]+"%"),node("span","checkout errors"));
    chart.append(current,makeSparkline(incident.metrics.error_rate_pct, ["#df7e70","#2e9b8e","#719adb","#d0ac40"][index%4]));
    const footer = node("div",undefined,"card-footer"), badge=node("span", reports[incident.id]?.status ?? severity(incident),"badge " + (reports[incident.id]?.status ?? severity(incident)));
    const open = node("a",undefined,"card-open"); open.href=caseUrl(incident.id); open.setAttribute("aria-label","Open " + incident.title); open.append(icon("arrow-up-right"));
    footer.append(badge,node("small",`${incident.logs_count} logs / ${incident.changes_count} changes`),open);
    article.append(top,heading,node("p",incident.alert,"card-alert"),chart,footer); $("case-grid").append(article);
  }
  if (!filtered.length) $("case-grid").append(emptyState("No matching cases", "Try another filter.", "folder-search")); icons();
}
function emptyState(title, text, glyph) { const div=node("div",undefined,"empty-state");div.append(icon(glyph),node("h2",title),node("p",text));return div; }
function route() {
  const hash = location.hash.slice(1) || "/cases", [path,query] = hash.split("?"); const parts=path.split("/").filter(Boolean), params=new URLSearchParams(query ?? "");
  const candidate=parts[0] ?? "cases"; page=["cases","case","evidence","runbooks","evaluation","history"].includes(candidate) ? candidate : "cases";
  if (page === "case") { let id; try { id=decodeURIComponent(parts[1] ?? ""); } catch { id=""; } selected=incidents.find(item=>item.id===id); if (!selected) { location.hash="/cases";return; } }
  for (const section of document.querySelectorAll("[data-page]")) section.hidden=section.dataset.page!==page;
  for (const link of document.querySelectorAll("[data-nav]")) { const active=link.dataset.nav===page || (page==="case"&&link.dataset.nav==="cases"); link.setAttribute("aria-current",active?"page":"false"); }
  const labels={cases:"Case room",case:"Investigation",evidence:"Evidence vault",runbooks:"Runbook library",evaluation:"Evaluation lab",history:"Run history"};
  $("context-label").textContent="Workspace / " + labels[page]; document.title="Sherlog | " + labels[page]; error("");
  if(page==="cases") renderCases();
  if(page==="case") renderCase();
  if(page==="evidence") { const id=params.get("case"); if(id && incidents.some(item=>item.id===id)) $("vault-case").value=id; evidenceSource=sources[params.get("source")]?params.get("source"):"all"; highlightRef=params.get("ref"); renderEvidence(); }
  if(page==="runbooks") renderRunbooks(); if(page==="evaluation") renderEvaluation(); if(page==="history") renderHistory();
  window.scrollTo({top:0,behavior:"instant"}); icons(); scheduleTrail();
}
function showTab(name) { for(const tab of document.querySelectorAll("[data-tab]")){const active=tab.dataset.tab===name;tab.setAttribute("aria-selected",String(active));tab.tabIndex=active?0:-1;$(tab.dataset.tab+"-panel").hidden=!active;} }
function renderCase() {
  const activeRun=running && runningId===selected.id;
  report=activeRun ? null : reports[selected.id] ?? null;
  $("case-number").textContent="CASE / " + String(incidents.indexOf(selected)+1).padStart(3,"0") + " / " + selected.service.toUpperCase();
  $("title").textContent=selected.title; $("alert").textContent=selected.alert; $("signal-label").textContent=selected.id;
  $("mode").value=prefs.mode; $("mode").disabled=running; $("investigate").disabled=running; $("loading").hidden=!activeRun;
  $("case-state").textContent=activeRun?"Investigating":report?.status??"Uninvestigated";
  $("case-state").className="badge " + (report?.status ?? severity(selected)); $("empty").hidden=Boolean(report)||activeRun;
  $("empty-alert").textContent=selected.alert; $("result").hidden=!report; $("export").disabled=!report;
  $("open-vault").href=vaultUrl(selected.id); $("case-notes").value=read("notes:"+selected.id,""); updatePinButton();
  if(report){
    $("outcome").textContent=report.status;$("support").textContent=report.support;$("calls").textContent=report.tool_calls+" / "+(report.budget??6);$("elapsed").textContent=report.duration_ms.toFixed(1)+" ms";
    $("cause").textContent=pretty(report.cause);$("cause").className="badge "+report.status;$("summary").textContent=report.summary;$("limitations").textContent=report.limitations;
    $("citations").replaceChildren(...report.citations.map(ref=>{const a=node("a",ref,"citation");a.href=vaultUrl(selected.id,"all",ref);a.title="Open evidence "+ref;return a;}));
    $("actions").replaceChildren(...report.actions.map(action=>node("li",action)));$("candidates").textContent=report.candidates.length>1?"Supported hypotheses: "+report.candidates.map(item=>item.title).join("; "):"";
    $("metrics").replaceChildren();
    for(const row of report.evidence.filter(row=>row.source==="inspect_metrics")){
      const metric=node("div",undefined,"metric"), bars=node("div",undefined,"metric-bars"), scale=row.name.endsWith("_pct")?100:Math.max(row.after,row.before,5000);
      const before=node("div",undefined,"metric-before"),after=node("div",undefined,"metric-after");before.style.width=Math.min(100,row.before/scale*100)+"%";after.style.width=Math.min(100,row.after/scale*100)+"%";
      bars.append(before,after);metric.append(node("span",pretty(row.name)),node("strong",row.before+" → "+row.after),bars);$("metrics").append(metric);
    }
    $("trace").replaceChildren(...report.trace.map((step,i)=>{const li=node("li");li.append(node("strong",(i+1)+". "+step.tool),node("p",step.reason),node("small",`${step.ok?"Success":"Failed"} / ${step.records} records / ${step.duration_ms} ms / ${JSON.stringify(step.arguments)}`));if(step.error)li.append(node("p",step.error));return li;}));
  }
  showTab("report");updateTrail();icons();
}
async function investigate() {
  if(running||!selected)return;const incident=selected, mode=$("mode").value, budget=prefs.budget;running=true;runningId=incident.id;error("");renderCase();
  document.body.classList.add("is-investigating");scheduleTrail();
  try{
    const result=await api("/api/investigate",{incident:incident.id,mode,budget});reports[incident.id]=result;save("reports",reports);
    history.unshift({id:crypto.randomUUID(),case:incident.id,time:new Date().toISOString(),report:result});history.splice(50);save("history",history);
    flowUntil=performance.now()+1800;toast("Investigation saved: "+result.status);
  }catch(exc){error(exc.message);}
  finally{running=false;runningId=null;document.body.classList.remove("is-investigating");if(page==="case")renderCase();renderPins();if(page==="cases")renderCases();if(page==="history")renderHistory();}
}
function exportReport(value) {if(!value){toast("No report available for this case");return;}const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:"application/json"}));const a=node("a");a.href=url;a.download="sherlog-"+value.incident_id+".json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function renderEvidence(){
  const value=reports[$("vault-case").value], search=$("evidence-search").value.toLowerCase(), cited=$("cited-only").checked;
  $("vault-export").disabled=!value;$("vault-summary").textContent=value?`${value.incident_id} / ${value.evidence.length} collected records / ${value.mode}`:"No collected observations";
  document.querySelector(".source-filters").replaceChildren(...Object.entries(sources).map(([key,label])=>{const b=node("button",label);b.setAttribute("aria-pressed",String(evidenceSource===key));b.addEventListener("click",()=>{evidenceSource=key;highlightRef=null;renderEvidence();});return b;}));
  $("evidence").replaceChildren();
  const rows=value?.evidence.filter(row=>(evidenceSource==="all"||row.source===evidenceSource)&&(!cited||value.citations.includes(row.id))&&JSON.stringify(row).toLowerCase().includes(search))??[];
  for(const row of rows){const tr=node("tr");if(row.id===highlightRef)tr.className="is-cited";const ref=node("button",row.id,"reference-button");ref.addEventListener("click",()=>openEvidence(row));const td=node("td");td.append(ref);const view=node("button",undefined,"icon-button");view.title="Inspect "+row.id;view.setAttribute("aria-label",view.title);view.append(icon("arrow-up-right"));view.addEventListener("click",()=>openEvidence(row));const last=node("td");last.append(view);
    tr.append(td,node("td",sources[row.source]??pretty(row.source)),node("td",row.message??row.description??row.title??`${row.name}: ${row.before} → ${row.after}`),last);$("evidence").append(tr);}
  if(!rows.length){const td=node("td",value?"No matching evidence.":"No investigation recorded for this case.","table-empty");td.colSpan=4;const tr=node("tr");tr.append(td);$("evidence").append(tr);}icons();
}
function openDrawer(title,children){$("drawer-title").textContent=title;$("drawer-body").replaceChildren(...children);icons();if(!$("drawer").open)$("drawer").showModal();}
function openEvidence(row){const badge=node("span",sources[row.source]??row.source,"badge normal"),pre=node("pre",JSON.stringify(row,null,2));openDrawer("Evidence / "+row.id,[badge,pre]);}
function renderRunbooks(){
  const query=$("runbook-search").value.toLowerCase();$("runbook-grid").replaceChildren();
  for(const [index,book] of runbooks.entries()){if(!JSON.stringify(book).toLowerCase().includes(query))continue;const article=node("article",undefined,"runbook-card "+tone(index)),top=node("div",undefined,"card-top");top.append(icon(["database","credit-card","git-branch","memory-stick"][index]),node("span",book.id,"case-serial"));const tags=node("div",undefined,"book-keywords");tags.append(...book.keywords.slice(0,3).map(word=>node("span",word)));
    const button=node("button",undefined,"text-button");button.append(node("span","Read runbook"),icon("arrow-up-right"));button.addEventListener("click",()=>openRunbook(book));article.append(top,node("h2",book.title),node("p",pretty(book.metric)+" ≥ "+book.threshold),tags,button);$("runbook-grid").append(article);}
  if(!$("runbook-grid").children.length)$("runbook-grid").append(emptyState("No matching runbooks","","book-open"));icons();
}
function openRunbook(book){const conditions=node("div",undefined,"runbook-conditions");conditions.append(node("h3","Evidence conditions"),node("p",pretty(book.metric)+" rises above "+book.threshold),node("p","Warning/error log matches: "+book.log_patterns.join("; ")));if(book.requires_recent_change)conditions.append(node("p","Recent deployment: within 30 minutes"));const actions=node("ol");actions.append(...book.actions.map(action=>node("li",action)));openDrawer(book.title,[node("span",book.id,"badge normal"),conditions,node("h3","Suggested actions"),actions]);}
function renderEvaluation(){
  if(!evaluation)return;$("eval-provenance").textContent=(evaluation.provenance??"Recorded offline baseline")+(evaluation.evaluated_at?" / "+new Date(evaluation.evaluated_at).toLocaleTimeString():"");
  $("eval-passed").textContent=evaluation.passed+" / "+evaluation.cases;$("eval-dataset").textContent=evaluation.dataset;$("eval-citations").textContent=pct(evaluation.citation_validity);$("eval-budget").textContent=pct(evaluation.budget_compliance);$("eval-calls").textContent=evaluation.mean_tool_calls;$("eval-limitations").textContent=evaluation.limitations;
  $("eval-chart").replaceChildren();for(const [label,value] of [["Evidence-gated workflow",evaluation.cause_accuracy],["Log-only baseline",evaluation.baseline_cause_accuracy]]){const row=node("div",undefined,"eval-bar-row"),bar=node("div",undefined,"eval-bar"),fill=node("div");fill.style.width=pct(value);bar.append(fill);row.append(node("span",label),node("strong",pct(value)),bar);$("eval-chart").append(row);}
  $("eval-results").replaceChildren(...evaluation.results.map(row=>{const tr=node("tr"),caseCell=node("td"),a=node("a",row.incident);a.href=caseUrl(row.incident);caseCell.append(a);const status=node("td"),badge=node("span",row.pass?"Pass":"Fail","badge "+(row.pass?"normal":"critical"));status.append(badge);tr.append(caseCell,node("td",pretty(row.expected)),node("td",pretty(row.actual)),status,node("td",row.duration_ms.toFixed(1)+" ms"));return tr;}));
}
function renderHistory(){
  $("history-summary").textContent=history.length+" saved runs on this device";$("history-list").replaceChildren();
  for(const item of history){
    const incident=incidents.find(row=>row.id===item.case);if(!incident)continue;
    const row=node("article",undefined,"history-row"),glyph=node("span",undefined,"history-glyph");glyph.append(icon("scan-line"));
    const info=node("div"),link=node("a",incident.title);link.href=caseUrl(item.case);link.title="Open current case";info.append(link,node("small",new Date(item.time).toLocaleString()+" / "+item.report.mode));
    const badge=node("span",item.report.status,"badge "+item.report.status),inspectButton=node("button",undefined,"icon-button"),exportButton=node("button",undefined,"icon-button");
    inspectButton.title="Inspect saved run";inspectButton.setAttribute("aria-label",inspectButton.title);inspectButton.append(icon("eye"));inspectButton.addEventListener("click",()=>openDrawer("Saved investigation",[node("p",incident.title),node("p",new Date(item.time).toLocaleString(),"muted"),node("pre",JSON.stringify(item.report,null,2),"raw-evidence")]));
    exportButton.title="Export saved run";exportButton.setAttribute("aria-label",exportButton.title);exportButton.append(icon("download"));exportButton.addEventListener("click",()=>exportReport(item.report));
    row.append(glyph,info,badge,node("small",item.report.tool_calls+" tool calls"),inspectButton,exportButton);$("history-list").append(row);
  }
  if(!history.length)$("history-list").append(emptyState("No recorded runs","","history"));icons();
}
function openCompare(){
  const select=node("select");select.setAttribute("aria-label","Compare with case");for(const item of incidents.filter(item=>item.id!==selected.id)){const option=node("option",item.title);option.value=item.id;select.append(option);}const content=node("div",undefined,"comparison");
  function draw(){const other=incidents.find(item=>item.id===select.value);content.replaceChildren();const table=node("table"),head=node("thead"),header=node("tr");header.append(node("th","Metric"),node("th",selected.title),node("th",other.title));head.append(header);const body=node("tbody");for(const [metric,values]of Object.entries(selected.metrics)){const tr=node("tr");tr.append(node("td",pretty(metric)),node("td",String(values[1])),node("td",String(other.metrics[metric][1])));body.append(tr);}table.append(head,body);content.append(table,node("p","Current synthetic snapshots / before diagnosis", "muted"));}
  select.addEventListener("change",draw);draw();openDrawer("Compare signals",[select,content]);
}
async function checkModel(){
  $("check-model").disabled=true;$("model-status").textContent="Checking Ollama...";
  try{const result=await api("/api/model-status");const labels={ready:"Ollama ready",model_missing:"Ollama running / model missing",unavailable:"Ollama unreachable"};$("model-status").textContent=labels[result.status];$("model-status").dataset.status=result.status;$("model-details").replaceChildren();for(const [label,value]of [["Model",result.model],["Endpoint",result.endpoint]])$("model-details").append(node("dt",label),node("dd",value));if(result.status!=="ready")$("model-details").append(node("dt","Model download"),node("dd","ollama pull "+result.model));}catch(exc){$("model-status").textContent=exc.message;}finally{$("check-model").disabled=false;}
}
function updateTrail(){
  $("trail-state").textContent=running?"Collecting observations":report?"Recorded tool trace":"Awaiting observations";$("verdict-label").textContent=report?pretty(report.cause):"Undetermined";$("verdict-detail").textContent=report?report.support+" evidence":"Evidence pending";$("trail-verdict").dataset.state=report?.status??"pending";
  for(const button of document.querySelectorAll(".trail-tool")){const steps=report?.trace.filter(step=>step.tool===button.dataset.source)??[],step=steps.find(item=>item.ok)??steps.at(-1);button.dataset.state=step?(step.ok?"complete":"failed"):"pending";button.querySelector(".tool-count").textContent=step?step.records:"--";button.disabled=!step;}scheduleTrail();
}
function scheduleTrail(){cancelAnimationFrame(trailFrame);if(page==="case")trailFrame=requestAnimationFrame(drawTrail);}
function drawTrail(now){
  if(page!=="case")return;const canvas=$("trail-canvas"),bounds=$("trail-map").getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,2),ctx=canvas.getContext("2d"),width=Math.round(bounds.width*ratio),height=Math.round(bounds.height*ratio);if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,bounds.width,bounds.height);
  const point=(el,right)=>{const r=el.getBoundingClientRect();return{x:(right?r.right:r.left)-bounds.left,y:r.top+r.height/2-bounds.top};};const start=point($("trail-alert"),true),end=point($("trail-verdict"),false),moving=!reducedMotion()&&(running||now<flowUntil);ctx.lineWidth=1.4;ctx.lineDashOffset=moving?-now/45:0;
  for(const button of document.querySelectorAll(".trail-tool")){const left=point(button,false),right=point(button,true);ctx.strokeStyle=button.dataset.state==="complete"?"#73b8ac":button.dataset.state==="failed"?"#df7e70":"#cdd5d9";ctx.setLineDash(moving?[3,6]:[]);for(const[a,b]of[[start,left],[right,end]]){const mid=(a.x+b.x)/2;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.bezierCurveTo(mid,a.y,mid,b.y,b.x,b.y);ctx.stroke();}}if(moving)trailFrame=requestAnimationFrame(drawTrail);
}
$("case-search").addEventListener("input",renderCases);$("severity-filter").addEventListener("change",renderCases);
for(const b of document.querySelectorAll("[data-scope]"))b.addEventListener("click",()=>{scope=b.dataset.scope;for(const button of document.querySelectorAll("[data-scope]"))button.setAttribute("aria-pressed",String(button===b));renderCases();});
for(const value of["grid","list"])$(value+"-view").addEventListener("click",()=>{layout=value;$("grid-view").setAttribute("aria-pressed",String(value==="grid"));$("list-view").setAttribute("aria-pressed",String(value==="list"));renderCases();});
$("global-search").addEventListener("click",()=>{location.hash="/cases";setTimeout(()=>$("case-search").focus(),0);});$("quick-start").addEventListener("click",()=>{if(incidents.length)location.hash=caseUrl(incidents[0].id).slice(1);});
$("investigate").addEventListener("click",investigate);$("detail-pin").addEventListener("click",()=>pinCase(selected.id));$("compare").addEventListener("click",openCompare);$("export").addEventListener("click",()=>exportReport(report));$("vault-export").addEventListener("click",()=>exportReport(reports[$("vault-case").value]));
$("case-notes").addEventListener("input",()=>{save("notes:"+selected.id,$("case-notes").value);$("notes-status").textContent="Saved on this device";});
for(const b of document.querySelectorAll(".trail-tool"))b.addEventListener("click",()=>{location.hash=vaultUrl(selected.id,b.dataset.source).slice(1);});
for(const tab of document.querySelectorAll("[data-tab]")){tab.addEventListener("click",()=>showTab(tab.dataset.tab));tab.addEventListener("keydown",event=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;event.preventDefault();const tabs=[...document.querySelectorAll("[data-tab]")],i=tabs.indexOf(tab),next=event.key==="Home"?0:event.key==="End"?tabs.length-1:(i+(event.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length;showTab(tabs[next].dataset.tab);tabs[next].focus();});}
for(const id of["vault-case","cited-only"])$(id).addEventListener("change",()=>{highlightRef=null;renderEvidence();});$("evidence-search").addEventListener("input",renderEvidence);$("runbook-search").addEventListener("input",renderRunbooks);
$("run-eval").addEventListener("click",async()=>{const b=$("run-eval");b.disabled=true;error("");try{evaluation=await api("/api/evaluate",{});renderEvaluation();toast("Offline evaluation complete: "+evaluation.passed+" / "+evaluation.cases);}catch(exc){error(exc.message);}finally{b.disabled=false;}});
for(const button of document.querySelectorAll(".settings-trigger"))button.addEventListener("click",()=>{$("settings").showModal();checkModel();});$("check-model").addEventListener("click",checkModel);
for(const b of document.querySelectorAll(".close-dialog"))b.addEventListener("click",()=>b.closest("dialog").close());for(const dialog of document.querySelectorAll("dialog"))dialog.addEventListener("click",event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
function savePreferences(){prefs.mode=$("default-mode").value;prefs.budget=Number($("budget").value);prefs.motion=$("reduce-motion").checked;save("preferences",prefs);$("budget-value").textContent=prefs.budget;document.body.classList.toggle("reduce-motion",prefs.motion);if(!running)$("mode").value=prefs.mode;scheduleTrail();}
$("default-mode").value=prefs.mode;$("budget").value=prefs.budget;$("budget-value").textContent=prefs.budget;$("reduce-motion").checked=prefs.motion;document.body.classList.toggle("reduce-motion",prefs.motion);for(const id of["default-mode","budget","reduce-motion"])$(id).addEventListener("input",savePreferences);
new ResizeObserver(scheduleTrail).observe($("trail-map"));motionPreference.addEventListener("change",scheduleTrail);window.addEventListener("hashchange",()=>{if(incidents.length)route();});icons();
(async()=>{try{[incidents,runbooks,evaluation]=await Promise.all([api("/api/incidents"),api("/api/runbooks"),api("/api/evaluation")]);$("nav-count").textContent=incidents.length;for(const item of incidents){const option=node("option",item.title);option.value=item.id;$("vault-case").append(option);}renderPins();route();}catch(exc){error(exc.message);}})();
