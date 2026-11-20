const form = document.getElementById("registrationForm");
const statusEl = document.getElementById("formStatus");
const submitButton = document.getElementById("submitButton");
const $ = (name) => form.elements.namedItem(name);

const strands = {
  "11": ["ASSH", "BE", "CUART", "ICT", "STEM"],
  "12": ["MAWD", "CUART", "HUMSS", "STEM", "ABM"]
};

let isSubmitting = false;

function setVisible(id, visible) {
  document.getElementById(id).classList.toggle("hidden", !visible);
}

function updateFields() {
  const division = form.querySelector('input[name="division"]:checked')?.value;
  const college = division === "college";
  const shs = division === "senior_high";
  const outsider = division === "outsider";
  const hasGrade = shs && Boolean($("gradeLevel").value);

  setVisible("courseWrap", college);
  setVisible("yearWrap", college);
  setVisible("gradeWrap", shs);
  setVisible("strandWrap", hasGrade);
  setVisible("outsiderWrap", outsider);

  // Disable hidden controls as well as removing their required state.
  // This prevents hidden/stale selections from blocking submission.
  $("course").disabled = !college;
  $("year").disabled = !college;
  $("gradeLevel").disabled = !shs;
  $("strand").disabled = !hasGrade;

  $("course").required = college;
  $("year").required = college;
  $("gradeLevel").required = shs;
  $("strand").required = hasGrade;

  if (!college) {
    $("course").value = "";
    $("year").value = "";
  }

  if (!shs) {
    $("gradeLevel").value = "";
    $("strand").innerHTML = '<option value="">Select strand</option>';
  }
}

function updateStrands() {
  const grade = $("gradeLevel").value;
  $("strand").innerHTML = '<option value="">Select strand</option>';

  (strands[grade] || []).forEach((strand) => {
    $("strand").add(new Option(strand, strand));
  });

  $("strand").value = "";
  updateFields();
}

async function refreshStats() {
  try {
    const response = await fetch("/api/stats", { cache: "no-store" });
    if (!response.ok) throw new Error("Stats unavailable");

    const stats = await response.json();
    document.getElementById("total").textContent = stats.total;
    document.getElementById("remaining").textContent =
      stats.total < stats.target
        ? `${stats.remaining} more needed`
        : stats.total === stats.target
          ? "200-PERSON TARGET REACHED"
          : `${stats.total - stats.target} ABOVE TARGET`;

    document.getElementById("meterFill").style.width = `${stats.percent}%`;
    document.getElementById("percent").textContent = `${stats.percent}% COMPLETE`;
    document.getElementById("thresholdMessage").textContent =
      stats.total > stats.target
        ? "The 200-person target has been exceeded. Registration remains open."
        : stats.targetReached
          ? "The 200-person target has been reached. Registration remains open."
          : "Every registration brings the celebration closer. Registration remains open until organizers close it.";
  } catch {
    document.getElementById("remaining").textContent =
      "Registration count temporarily unavailable";
  }
}

form.addEventListener("change", (event) => {
  if (event.target.name === "gradeLevel") {
    updateStrands();
  } else {
    updateFields();
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isSubmitting) return;
  statusEl.textContent = "";

  // novalidate lets this handler display a clear message instead of allowing
  // browser validation to silently prevent the submit handler from running.
  if (!form.reportValidity()) {
    statusEl.textContent = "Please complete the highlighted required fields.";
    const firstInvalid = form.querySelector(":invalid");
    firstInvalid?.focus();
    firstInvalid?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  const division = form.querySelector('input[name="division"]:checked')?.value;

  const payload = {
    division,
    fullName: $("fullName").value.trim(),
    age: Number($("age").value),
    course: division === "college" ? $("course").value : null,
    year: division === "college" ? $("year").value : null,
    gradeLevel: division === "senior_high" ? $("gradeLevel").value : null,
    strand: division === "senior_high" ? $("strand").value : null,
    wasStiStudent: division === "outsider" ? $("wasStiStudent").checked : false,
    acknowledged: $("acknowledged").checked
  };

  isSubmitting = true;
  submitButton.disabled = true;
  submitButton.textContent = "SAVING REGISTRATION…";
  statusEl.textContent = "Submitting your registration. Please wait.";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const responseText = await response.text();
    let result = {};

    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch {
      result = { error: responseText || "Unexpected server response." };
    }

    if (!response.ok) {
      throw new Error(
        result.error ||
        (response.status === 429
          ? "Too many attempts from this network. Please wait and try again."
          : "Registration failed. Please try again.")
      );
    }

    statusEl.textContent =
      `Registration recorded successfully. Your reference number is #${result.registrationId}. Please coordinate offline payment with the Council of Leaders.`;

    form.reset();
    $("strand").innerHTML = '<option value="">Select strand</option>';
    updateFields();
    await refreshStats();
  } catch (error) {
    if (error.name === "AbortError") {
      statusEl.textContent =
        "The request took too long. Please refresh the page and check with the organizers before submitting again.";
    } else if (!navigator.onLine) {
      statusEl.textContent =
        "You appear to be offline. Check your internet connection and try again.";
    } else {
      statusEl.textContent =
        error.message || "Unable to submit registration. Please try again.";
    }
  } finally {
    clearTimeout(timeoutId);
    isSubmitting = false;
    submitButton.disabled = false;
    submitButton.innerHTML = 'COMPLETE REGISTRATION <span>✦</span>';
  }
});

updateFields();
refreshStats();
setInterval(refreshStats, 30000);
