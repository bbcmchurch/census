(function () {
  "use strict";

  const STORAGE_KEY = "bbcm_census_records_v1";
  const SETTINGS_KEY = "bbcm_census_settings_v1";
  const DEFAULT_CHURCH_NAME = "Bridge Builder's Christian Ministries";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  let records = [];

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    applyChurchName();
    loadRecords();
    resetForm();
    bindForm();
  }

  function applyChurchName() {
    try {
      const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      const churchName = settings.churchName || DEFAULT_CHURCH_NAME;
      const title = $(".public-header h1");
      if (title) title.textContent = churchName;
    } catch (error) {
      console.error(error);
    }
  }

  function loadRecords() {
    try {
      records = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]").map(normalizeRecord);
    } catch (error) {
      console.error(error);
      records = [];
      showToast("Saved records could not be loaded in this browser.", "error");
    }
  }

  function saveRecords() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  function bindForm() {
    $("#birthday").addEventListener("change", () => {
      $("#age").value = calculateAge($("#birthday").value) || "";
    });

    $("#publicRegistrationForm").addEventListener("submit", handleSubmit);
    $("#resetPublicFormButton").addEventListener("click", resetForm);
    $("#addFamilyMemberButton").addEventListener("click", () => addFamilyRow());

    $("#familyList").addEventListener("input", (event) => {
      if (event.target.classList.contains("fm-birthday")) {
        const row = event.target.closest(".family-row");
        $(".fm-age", row).value = calculateAge(event.target.value) || "";
      }
    });

    $("#familyList").addEventListener("click", (event) => {
      const removeButton = event.target.closest("[data-remove-family]");
      if (!removeButton) return;
      removeButton.closest(".family-row").remove();
      renumberFamilyRows();
    });
  }

  function handleSubmit(event) {
    event.preventDefault();
    const record = collectRecord();
    const validation = validateRecord(record);

    if (!validation.valid) {
      showFormErrors(validation.errors);
      showToast("Please correct the registration details.", "error");
      return;
    }

    records.push(record);
    saveRecords();
    showFormErrors([]);
    $("#publicSuccess").classList.add("visible");
    showToast("Registration submitted.");
    resetForm();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function collectRecord() {
    const birthday = $("#birthday").value;
    const memberId = $("#memberId").value || generateMemberId();
    const now = nowIso();

    return normalizeRecord({
      id: memberId,
      memberId,
      fullName: valueOf("#fullName"),
      nickname: valueOf("#nickname"),
      address: valueOf("#address"),
      barangay: valueOf("#barangay"),
      city: valueOf("#city"),
      province: valueOf("#province"),
      mobile: valueOf("#mobile"),
      email: valueOf("#email"),
      birthday,
      gender: valueOf("#gender"),
      civilStatus: valueOf("#civilStatus"),
      anniversary: valueOf("#anniversary"),
      spouseName: valueOf("#spouseName"),
      household: valueOf("#household"),
      emergencyName: valueOf("#emergencyName"),
      emergencyMobile: valueOf("#emergencyMobile"),
      membershipStatus: valueOf("#membershipStatus"),
      baptismStatus: valueOf("#baptismStatus"),
      dateJoined: valueOf("#dateJoined"),
      ministry: valueOf("#ministry"),
      role: valueOf("#role"),
      cellGroup: valueOf("#cellGroup"),
      notes: valueOf("#notes"),
      consent: $("#consent").checked,
      familyMembers: collectFamilyMembers(),
      createdAt: now,
      updatedAt: now
    });
  }

  function collectFamilyMembers() {
    return $$(".family-row", $("#familyList"))
      .map((row) => {
        const birthday = $(".fm-birthday", row).value;
        return normalizeFamilyMember({
          id: row.dataset.familyId || makeId("FM"),
          fullName: fieldValue(".fm-fullName", row),
          relationship: fieldValue(".fm-relationship", row),
          birthday,
          gender: fieldValue(".fm-gender", row),
          mobile: fieldValue(".fm-mobile", row),
          email: fieldValue(".fm-email", row),
          isChurchMember: $(".fm-isChurchMember", row).value === "Yes",
          linkedMemberId: fieldValue(".fm-linkedMemberId", row),
          notes: fieldValue(".fm-notes", row)
        });
      })
      .filter((member) => {
        return [
          member.fullName, member.relationship, member.birthday, member.gender,
          member.mobile, member.email, member.linkedMemberId, member.notes
        ].some((value) => String(value || "").trim() !== "");
      });
  }

  function validateRecord(record) {
    const errors = [];
    const requiredFields = [
      ["Full Name", record.fullName],
      ["Complete Address", record.address],
      ["City", record.city],
      ["Province", record.province],
      ["Mobile Number", record.mobile],
      ["Birthday", record.birthday],
      ["Gender", record.gender],
      ["Membership Status", record.membershipStatus],
      ["Date Joined / First Visit Date", record.dateJoined]
    ];

    requiredFields.forEach(([label, value]) => {
      if (!String(value || "").trim()) errors.push(`${label} is required.`);
    });

    if (!record.consent) errors.push("Data privacy consent is required.");
    if (record.mobile && !isValidPhone(record.mobile)) errors.push("Mobile number format is invalid.");
    if (record.emergencyMobile && !isValidPhone(record.emergencyMobile)) errors.push("Emergency contact number format is invalid.");
    if (record.email && !isValidEmail(record.email)) errors.push("Email address format is invalid.");
    if (record.birthday && !isValidPastOrTodayDate(record.birthday)) errors.push("Birthday must be a valid date that is not in the future.");
    if (isDuplicateRecord(record)) errors.push("A matching registration already exists in this browser.");

    record.familyMembers.forEach((member, index) => {
      const label = `Family member ${index + 1}`;
      if (!member.fullName) errors.push(`${label}: Full Name is required.`);
      if (member.mobile && !isValidPhone(member.mobile)) errors.push(`${label}: Mobile number format is invalid.`);
      if (member.email && !isValidEmail(member.email)) errors.push(`${label}: Email address format is invalid.`);
      if (member.birthday && !isValidPastOrTodayDate(member.birthday)) errors.push(`${label}: Birthday must not be in the future.`);
    });

    return { valid: errors.length === 0, errors };
  }

  function showFormErrors(errors) {
    const box = $("#formErrors");
    if (!errors.length) {
      box.classList.remove("visible");
      box.innerHTML = "";
      return;
    }
    box.innerHTML = `<ul>${errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>`;
    box.classList.add("visible");
  }

  function resetForm() {
    $("#publicRegistrationForm").reset();
    $("#memberId").value = generateMemberId();
    $("#age").value = "";
    $("#familyList").innerHTML = "";
    showFormErrors([]);
  }

  function addFamilyRow(member = {}) {
    const normalized = normalizeFamilyMember(member);
    const row = document.createElement("div");
    row.className = "family-row";
    row.dataset.familyId = normalized.id;
    row.innerHTML = `
      <div class="family-row-header">
        <strong>Family Member</strong>
        <button class="button danger" type="button" data-remove-family>Remove</button>
      </div>
      <div class="family-grid">
        <label>
          <span>Full Name</span>
          <input class="fm-fullName" type="text" value="${escapeAttribute(normalized.fullName)}">
        </label>
        <label>
          <span>Relationship</span>
          <input class="fm-relationship" type="text" value="${escapeAttribute(normalized.relationship)}" placeholder="Spouse, child, parent">
        </label>
        <label>
          <span>Birthday</span>
          <input class="fm-birthday" type="date" value="${escapeAttribute(normalized.birthday)}">
        </label>
        <label>
          <span>Age</span>
          <input class="fm-age" type="number" value="${escapeAttribute(normalized.age)}" readonly>
        </label>
        <label>
          <span>Gender</span>
          <select class="fm-gender">
            ${optionHtml("", "Select gender", normalized.gender)}
            ${optionHtml("Male", "Male", normalized.gender)}
            ${optionHtml("Female", "Female", normalized.gender)}
          </select>
        </label>
        <label>
          <span>Mobile Number</span>
          <input class="fm-mobile" type="tel" value="${escapeAttribute(normalized.mobile)}">
        </label>
        <label>
          <span>Email Address</span>
          <input class="fm-email" type="email" value="${escapeAttribute(normalized.email)}">
        </label>
        <label>
          <span>Is Church Member?</span>
          <select class="fm-isChurchMember">
            ${optionHtml("No", "No", normalized.isChurchMember ? "Yes" : "No")}
            ${optionHtml("Yes", "Yes", normalized.isChurchMember ? "Yes" : "No")}
          </select>
        </label>
        <label>
          <span>Linked Member ID</span>
          <input class="fm-linkedMemberId" type="text" value="${escapeAttribute(normalized.linkedMemberId)}">
        </label>
        <label class="wide">
          <span>Notes</span>
          <textarea class="fm-notes" rows="2">${escapeHtml(normalized.notes)}</textarea>
        </label>
      </div>
    `;
    $("#familyList").appendChild(row);
    renumberFamilyRows();
  }

  function renumberFamilyRows() {
    $$(".family-row", $("#familyList")).forEach((row, index) => {
      $(".family-row-header strong", row).textContent = `Family Member ${index + 1}`;
    });
  }

  function normalizeRecord(record) {
    const birthday = record.birthday || "";
    return {
      id: record.id || record.memberId || generateMemberId(),
      memberId: record.memberId || record.id || generateMemberId(),
      fullName: record.fullName || "",
      nickname: record.nickname || "",
      address: record.address || "",
      barangay: record.barangay || "",
      city: record.city || "",
      province: record.province || "",
      mobile: record.mobile || "",
      email: record.email || "",
      birthday,
      age: calculateAge(birthday),
      gender: record.gender || "",
      civilStatus: record.civilStatus || "",
      anniversary: record.anniversary || "",
      spouseName: record.spouseName || "",
      household: record.household || "",
      emergencyName: record.emergencyName || "",
      emergencyMobile: record.emergencyMobile || "",
      membershipStatus: record.membershipStatus || "",
      baptismStatus: record.baptismStatus || "",
      dateJoined: record.dateJoined || "",
      ministry: record.ministry || "",
      role: record.role || "",
      cellGroup: record.cellGroup || "",
      notes: record.notes || "",
      consent: Boolean(record.consent),
      familyMembers: Array.isArray(record.familyMembers) ? record.familyMembers.map(normalizeFamilyMember) : [],
      createdAt: record.createdAt || nowIso(),
      updatedAt: record.updatedAt || record.createdAt || nowIso()
    };
  }

  function normalizeFamilyMember(member) {
    const birthday = member.birthday || "";
    return {
      id: member.id || makeId("FM"),
      fullName: member.fullName || "",
      relationship: member.relationship || "",
      birthday,
      age: calculateAge(birthday),
      gender: member.gender || "",
      mobile: member.mobile || "",
      email: member.email || "",
      isChurchMember: member.isChurchMember === true || member.isChurchMember === "Yes",
      linkedMemberId: member.linkedMemberId || "",
      notes: member.notes || ""
    };
  }

  function calculateAge(dateValue) {
    if (!dateValue) return "";
    const date = parseLocalDate(dateValue);
    if (!date || Number.isNaN(date.getTime())) return "";
    const today = new Date();
    let age = today.getFullYear() - date.getFullYear();
    const monthDiff = today.getMonth() - date.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) age -= 1;
    return age >= 0 ? age : "";
  }

  function parseLocalDate(value) {
    if (!value) return null;
    const parts = value.split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function isValidPastOrTodayDate(value) {
    const date = parseLocalDate(value);
    if (!date || Number.isNaN(date.getTime())) return false;
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return date <= today;
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function isValidPhone(value) {
    const cleaned = digitsOnly(value);
    return cleaned.length >= 7 && cleaned.length <= 15 && /^[+\d\s().-]+$/.test(value);
  }

  function isDuplicateRecord(record) {
    const key = duplicateKey(record);
    return records.some((item) => duplicateKey(item) === key);
  }

  function duplicateKey(record) {
    return [normalize(record.fullName), record.birthday || "", digitsOnly(record.mobile)].join("|");
  }

  function generateMemberId() {
    const today = new Date();
    const stamp = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0")
    ].join("");
    let index = records.length + 1;
    let id = `BBCM-${stamp}-${String(index).padStart(4, "0")}`;
    while (records.some((record) => record.memberId === id || record.id === id)) {
      index += 1;
      id = `BBCM-${stamp}-${String(index).padStart(4, "0")}`;
    }
    return id;
  }

  function makeId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
  }

  function valueOf(selector) {
    return $(selector).value.trim();
  }

  function fieldValue(selector, root) {
    return $(selector, root).value.trim();
  }

  function normalize(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }

  function optionHtml(value, label, selectedValue) {
    return `<option value="${escapeAttribute(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }

  function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast ${type === "error" ? "error" : ""}`;
    toast.textContent = message;
    $("#toastContainer").appendChild(toast);
    setTimeout(() => toast.remove(), 4200);
  }
})();
