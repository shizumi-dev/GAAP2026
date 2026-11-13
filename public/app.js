const form = document.getElementById("registrationForm");
const statusEl = document.getElementById("formStatus");
const submitButton = document.getElementById("submitButton");
const $ = (name) => form.elements[name];
const strands = { "11":["ASSH","BE","CUACT","ICTCT","STEM"], "12":["MAWD","CUART","HUMSS","STEM","ABM"] };

function setVisible(id, visible) { document.getElementById(id).classList.toggle("hidden", !visible); }
function updateFields() {
  const division = form.querySelector('input[name="division"]:checked')?.value;
  const college = division === "college";
  const shs = division === "senior_high";
  setVisible("courseWrap", college); setVisible("yearWrap", college);
  setVisible("gradeWrap", shs); setVisible("strandWrap", shs && !!$("gradeLevel").value);
  $("course").required = college; $("year").required = college;
  $("gradeLevel").required = shs; $("strand").required = shs && !!$("gradeLevel").value;
}
function updateStrands() {
  const grade = $("gradeLevel").value;
  $("strand").innerHTML = '<option value="">Select strand</option>';
  (strands[grade] || []).forEach(s => $("strand").add(new Option(s,s)));
  updateFields();
}
async function refreshStats() {
  try {
    const response = await fetch("/api/stats");
    if (!response.ok) throw new Error();
    const s = await response.json();
    document.getElementById("total").textContent = s.total;
    document.getElementById("remaining").textContent = s.total < s.target ? `${s.remaining} more needed` : s.total === s.target ? "200-PERSON TARGET REACHED" : `${s.total - s.target} ABOVE TARGET`;
    document.getElementById("meterFill").style.width = `${s.percent}%`;
    document.getElementById("percent").textContent = `${s.percent}% COMPLETE`;
    document.getElementById("thresholdMessage").textContent = s.total > s.target ? "The 200-person target has been exceeded. Registration remains open." : s.targetReached ? "The 200-person target has been reached. Registration remains open." : "Every registration brings the celebration closer. Registration remains open until organizers close it.";
  } catch { document.getElementById("remaining").textContent = "Registration count temporarily unavailable"; }
}
form.addEventListener("change", e => { if (e.target.name === "gradeLevel") updateStrands(); else updateFields(); });
form.addEventListener("submit", async e => {
  e.preventDefault(); statusEl.textContent = "";
  const division = form.querySelector('input[name="division"]:checked')?.value;
  const payload = {
    division, fullName: $("fullName").value.trim(), age: Number($("age").value),
    course: division === "college" ? $("course").value : null,
    year: division === "college" ? $("year").value : null,
    gradeLevel: division === "senior_high" ? $("gradeLevel").value : null,
    strand: division === "senior_high" ? $("strand").value : null,
    acknowledged: $("acknowledged").checked
  };
  submitButton.disabled = true; submitButton.textContent = "SAVING REGISTRATION…";
  try {
    const response = await fetch("/api/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Registration failed.");
    statusEl.textContent = `Registration recorded successfully. Your reference number is #${result.registrationId}. Please coordinate offline payment with the Council of Leaders.`;
    form.reset(); updateFields(); await refreshStats();
  } catch(err) { statusEl.textContent = err.message || "Unable to submit registration."; }
  finally { submitButton.disabled = false; submitButton.innerHTML = 'COMPLETE REGISTRATION <span>✦</span>'; }
});
updateFields(); refreshStats();
setInterval(refreshStats, 30000);
