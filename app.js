(function () {
  "use strict";

  const STORAGE_KEY = "bbcm_census_records_v1";
  const SETTINGS_KEY = "bbcm_census_settings_v1";
  const AUTH_SESSION_KEY = "bbcm_admin_unlocked_v1";
  const DEFAULT_CHURCH_NAME = "Bridge Builder's Christian Ministries";
  const DEFAULT_ADMIN_PASSWORD = "admin123";

  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const MEMBER_HEADERS = [
    "Member ID", "Full Name", "Nickname / Preferred Name", "Complete Address",
    "Barangay", "City", "Province", "Mobile Number", "Email Address",
    "Birthday", "Age", "Gender", "Civil Status", "Wedding Anniversary Date",
    "Spouse Name", "Household / Family Group Name", "Emergency Contact Name",
    "Emergency Contact Number", "Membership Status", "Baptism Status",
    "Date Joined / First Visit Date", "Ministry Involvement",
    "Role / Service Label", "Cell Group / Bible Study Group", "Notes / Remarks",
    "Data Privacy Consent", "Family Members JSON", "Created Date", "Last Updated Date"
  ];

  const FAMILY_HEADERS = [
    "Member ID", "Member Name", "Household / Family Group Name", "Family Member ID",
    "Full Name", "Relationship", "Birthday", "Age", "Gender", "Mobile Number",
    "Email Address", "Is Church Member", "Linked Member ID", "Notes"
  ];

  const state = {
    records: [],
    settings: {
      churchName: DEFAULT_CHURCH_NAME,
      darkMode: false,
      compactMode: false,
      lastBackupAt: "",
      passwordHash: ""
    },
    activeSection: "dashboard",
    activeProfileId: "",
    selectedIds: new Set(),
    visibleRecords: [],
    sort: { key: "fullName", direction: "asc" },
    confirmAction: null,
    latestReport: null,
    adminStarted: false
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    loadSettings();
    applySettings();
    bindAuth();
    if (!isAdminUnlocked()) {
      showAuthScreen();
      return;
    }
    unlockAdmin();
  }

  function startAdminApp() {
    if (state.adminStarted) {
      renderAll();
      return;
    }
    state.adminStarted = true;
    loadRecords();
    populateMonthSelects();
    bindNavigation();
    bindForm();
    bindTableControls();
    bindDashboardActions();
    bindProfileActions();
    bindReportActions();
    bindImportExportActions();
    bindSettingsActions();
    bindConfirmModal();
    resetForm();
    renderAll();
    generateReport();
  }

  function loadRecords() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      state.records = saved ? JSON.parse(saved).map(normalizeRecord) : [];
    } catch (error) {
      console.error(error);
      state.records = [];
      showToast("Stored records could not be loaded. Starting with an empty list.", "error");
    }
  }

  function saveRecords() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records));
  }

  function loadSettings() {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      state.settings = { ...state.settings, ...(saved ? JSON.parse(saved) : {}) };
    } catch (error) {
      console.error(error);
    }
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  }

  function applySettings() {
    document.body.classList.toggle("dark-mode", Boolean(state.settings.darkMode));
    document.body.classList.toggle("compact-mode", Boolean(state.settings.compactMode));
    $$("[data-church-name]").forEach((node) => {
      node.textContent = state.settings.churchName || DEFAULT_CHURCH_NAME;
    });
    const settingsChurchName = $("#settingsChurchName");
    const darkModeToggle = $("#darkModeToggle");
    const compactModeToggle = $("#compactModeToggle");
    if (settingsChurchName) settingsChurchName.value = state.settings.churchName || DEFAULT_CHURCH_NAME;
    if (darkModeToggle) darkModeToggle.checked = Boolean(state.settings.darkMode);
    if (compactModeToggle) compactModeToggle.checked = Boolean(state.settings.compactMode);
    updatePublicRegistrationUrl();
    renderLastBackup();
  }

  function normalizeRecord(record) {
    const birthday = record.birthday || "";
    const familyMembers = Array.isArray(record.familyMembers)
      ? record.familyMembers.map(normalizeFamilyMember)
      : [];

    return {
      id: record.id || record.memberId || generateMemberId(),
      memberId: record.memberId || record.id || generateMemberId(),
      fullName: record.fullName || "",
      nickname: record.nickname || record.nickName || "",
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
      familyMembers,
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

  function bindNavigation() {
    $$(".nav-link").forEach((button) => {
      button.addEventListener("click", () => {
        showSection(button.dataset.section);
        $("#sidebar").classList.remove("open");
      });
    });

    $$("[data-section-target]").forEach((button) => {
      button.addEventListener("click", () => {
        showSection(button.dataset.sectionTarget);
      });
    });

    $("#menuButton").addEventListener("click", () => {
      $("#sidebar").classList.toggle("open");
    });
  }

  function bindAuth() {
    const loginForm = $("#adminLoginForm");
    const logoutButton = $("#logoutButton");

    if (loginForm) {
      loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const password = $("#adminPassword").value;
        const valid = await verifyAdminPassword(password);
        if (!valid) {
          showLoginError("Incorrect password.");
          return;
        }
        $("#adminPassword").value = "";
        showLoginError("");
        sessionStorage.setItem(AUTH_SESSION_KEY, "true");
        unlockAdmin();
        showToast("Admin app unlocked.");
      });
    }

    if (logoutButton) {
      logoutButton.addEventListener("click", () => {
        sessionStorage.removeItem(AUTH_SESSION_KEY);
        showAuthScreen();
        showToast("Admin app locked.");
      });
    }
  }

  function isAdminUnlocked() {
    return sessionStorage.getItem(AUTH_SESSION_KEY) === "true";
  }

  function showAuthScreen() {
    document.body.classList.add("admin-locked");
    window.setTimeout(() => {
      const passwordInput = $("#adminPassword");
      if (passwordInput) passwordInput.focus();
    }, 50);
  }

  function unlockAdmin() {
    document.body.classList.remove("admin-locked");
    startAdminApp();
  }

  function showLoginError(message) {
    const box = $("#loginErrors");
    if (!box) return;
    if (!message) {
      box.classList.remove("visible");
      box.textContent = "";
      return;
    }
    box.textContent = message;
    box.classList.add("visible");
  }

  async function verifyAdminPassword(password) {
    if (!state.settings.passwordHash) {
      return password === DEFAULT_ADMIN_PASSWORD;
    }
    return await hashPassword(password) === state.settings.passwordHash;
  }

  async function hashPassword(password) {
    const value = `bbcm-census-v1:${password}`;
    if (window.crypto?.subtle && window.TextEncoder) {
      const encoded = new TextEncoder().encode(value);
      const digest = await window.crypto.subtle.digest("SHA-256", encoded);
      return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    }

    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash << 5) + hash) + value.charCodeAt(index);
      hash |= 0;
    }
    return `fallback-${Math.abs(hash).toString(16)}`;
  }

  function showSection(section) {
    const sectionMap = {
      dashboard: "#dashboardSection",
      register: "#registerSection",
      members: "#membersSection",
      profile: "#profileSection",
      reports: "#reportsSection",
      importExport: "#importExportSection",
      settings: "#settingsSection"
    };

    if (!sectionMap[section]) return;
    state.activeSection = section;
    $$(".section").forEach((node) => node.classList.remove("active"));
    $(sectionMap[section]).classList.add("active");
    $$(".nav-link").forEach((button) => {
      button.classList.toggle("active", button.dataset.section === section);
    });
    $("#sectionTitle").textContent = $(sectionMap[section]).dataset.title || "Dashboard";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function bindForm() {
    $("#birthday").addEventListener("change", () => {
      $("#age").value = calculateAge($("#birthday").value) || "";
    });

    $("#memberForm").addEventListener("submit", handleFormSubmit);
    $("#resetFormButton").addEventListener("click", resetForm);
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

  function handleFormSubmit(event) {
    event.preventDefault();
    const afterSave = event.submitter?.dataset.afterSave || "table";
    const record = collectFormRecord();
    const validation = validateRecord(record);

    if (!validation.valid) {
      showFormErrors(validation.errors);
      showToast("Please correct the highlighted record details.", "error");
      return;
    }

    const existingIndex = state.records.findIndex((item) => item.id === record.id);
    if (existingIndex >= 0) {
      record.createdAt = state.records[existingIndex].createdAt;
      state.records[existingIndex] = record;
      showToast("Record updated successfully.");
    } else {
      state.records.push(record);
      showToast("Record saved successfully.");
    }

    saveRecords();
    state.selectedIds.clear();
    renderAll();

    if (afterSave === "addAnother") {
      resetForm();
      showSection("register");
    } else if (afterSave === "profile") {
      renderProfile(record.id);
      showSection("profile");
    } else {
      resetForm();
      showSection("members");
    }
  }

  function collectFormRecord() {
    const existingId = $("#editingRecordId").value;
    const memberId = $("#memberId").value || generateMemberId();
    const birthday = $("#birthday").value;
    const now = nowIso();

    return {
      id: existingId || memberId,
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
      age: calculateAge(birthday),
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
    };
  }

  function collectFamilyMembers() {
    return $$(".family-row", $("#familyList"))
      .map((row) => {
        const birthday = $(".fm-birthday", row).value;
        return {
          id: row.dataset.familyId || makeId("FM"),
          fullName: fieldValue(".fm-fullName", row),
          relationship: fieldValue(".fm-relationship", row),
          birthday,
          age: calculateAge(birthday),
          gender: fieldValue(".fm-gender", row),
          mobile: fieldValue(".fm-mobile", row),
          email: fieldValue(".fm-email", row),
          isChurchMember: $(".fm-isChurchMember", row).value === "Yes",
          linkedMemberId: fieldValue(".fm-linkedMemberId", row),
          notes: fieldValue(".fm-notes", row)
        };
      })
      .filter((member) => {
        return Object.entries(member).some(([key, value]) => {
          if (["id", "age", "isChurchMember"].includes(key)) return false;
          return String(value || "").trim() !== "";
        });
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

    if (!record.consent) {
      errors.push("Data privacy consent is required.");
    }

    if (record.mobile && !isValidPhone(record.mobile)) {
      errors.push("Mobile number format is invalid.");
    }

    if (record.emergencyMobile && !isValidPhone(record.emergencyMobile)) {
      errors.push("Emergency contact number format is invalid.");
    }

    if (record.email && !isValidEmail(record.email)) {
      errors.push("Email address format is invalid.");
    }

    if (record.birthday && !isValidPastOrTodayDate(record.birthday)) {
      errors.push("Birthday must be a valid date that is not in the future.");
    }

    if (isDuplicateRecord(record)) {
      errors.push("Possible duplicate found using Full Name + Birthday + Mobile Number.");
    }

    record.familyMembers.forEach((member, index) => {
      const label = `Family member ${index + 1}`;
      if (!member.fullName) {
        errors.push(`${label}: Full Name is required when adding a family member.`);
      }
      if (member.mobile && !isValidPhone(member.mobile)) {
        errors.push(`${label}: Mobile number format is invalid.`);
      }
      if (member.email && !isValidEmail(member.email)) {
        errors.push(`${label}: Email address format is invalid.`);
      }
      if (member.birthday && !isValidPastOrTodayDate(member.birthday)) {
        errors.push(`${label}: Birthday must not be in the future.`);
      }
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
    $("#memberForm").reset();
    $("#editingRecordId").value = "";
    $("#memberId").value = generateMemberId();
    $("#age").value = "";
    $("#familyList").innerHTML = "";
    $("#formTitle").textContent = "Register Member";
    showFormErrors([]);
  }

  function editRecord(id) {
    const record = findRecord(id);
    if (!record) {
      showToast("Record not found.", "error");
      return;
    }

    $("#editingRecordId").value = record.id;
    $("#memberId").value = record.memberId;
    $("#fullName").value = record.fullName;
    $("#nickname").value = record.nickname;
    $("#address").value = record.address;
    $("#barangay").value = record.barangay;
    $("#city").value = record.city;
    $("#province").value = record.province;
    $("#mobile").value = record.mobile;
    $("#email").value = record.email;
    $("#birthday").value = record.birthday;
    $("#age").value = calculateAge(record.birthday) || "";
    $("#gender").value = record.gender;
    $("#civilStatus").value = record.civilStatus;
    $("#anniversary").value = record.anniversary;
    $("#spouseName").value = record.spouseName;
    $("#household").value = record.household;
    $("#emergencyName").value = record.emergencyName;
    $("#emergencyMobile").value = record.emergencyMobile;
    $("#membershipStatus").value = record.membershipStatus;
    $("#baptismStatus").value = record.baptismStatus;
    $("#dateJoined").value = record.dateJoined;
    $("#ministry").value = record.ministry;
    $("#role").value = record.role;
    $("#cellGroup").value = record.cellGroup;
    $("#notes").value = record.notes;
    $("#consent").checked = Boolean(record.consent);
    $("#familyList").innerHTML = "";
    record.familyMembers.forEach(addFamilyRow);
    $("#formTitle").textContent = `Edit Record: ${record.fullName}`;
    showFormErrors([]);
    showSection("register");
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

  function bindTableControls() {
    [
      "#tableSearch", "#filterGender", "#filterStatus", "#filterAgeGroup",
      "#filterCivilStatus", "#filterMinistry", "#filterBirthdayMonth",
      "#filterAnniversaryMonth"
    ].forEach((selector) => {
      $(selector).addEventListener("input", renderMembersTable);
    });

    $("#clearFiltersButton").addEventListener("click", () => {
      $("#tableSearch").value = "";
      $("#filterGender").value = "";
      $("#filterStatus").value = "";
      $("#filterAgeGroup").value = "";
      $("#filterCivilStatus").value = "";
      $("#filterMinistry").value = "";
      $("#filterBirthdayMonth").value = "";
      $("#filterAnniversaryMonth").value = "";
      renderMembersTable();
    });

    $("#membersTable").addEventListener("click", (event) => {
      const sortButton = event.target.closest("[data-sort]");
      if (sortButton) {
        toggleSort(sortButton.dataset.sort);
        return;
      }

      const actionButton = event.target.closest("[data-row-action]");
      if (actionButton) {
        handleRowAction(actionButton.dataset.rowAction, actionButton.dataset.id);
      }
    });

    $("#membersTable").addEventListener("change", (event) => {
      if (event.target.classList.contains("row-select")) {
        if (event.target.checked) state.selectedIds.add(event.target.value);
        else state.selectedIds.delete(event.target.value);
        syncSelectAllState();
      }
    });

    $("#selectAllRows").addEventListener("change", (event) => {
      state.visibleRecords.forEach((record) => {
        if (event.target.checked) state.selectedIds.add(record.id);
        else state.selectedIds.delete(record.id);
      });
      renderMembersTable();
    });

    $("#bulkExportButton").addEventListener("click", () => {
      const selected = state.records.filter((record) => state.selectedIds.has(record.id));
      if (!selected.length) {
        showToast("Select at least one record to export.", "error");
        return;
      }
      exportMemberRecords(selected, "selected_members.csv");
    });

    $("#exportVisibleButton").addEventListener("click", () => {
      if (!state.visibleRecords.length) {
        showToast("No visible records to export.", "error");
        return;
      }
      exportMemberRecords(state.visibleRecords, "visible_members.csv");
    });
  }

  function toggleSort(key) {
    if (state.sort.key === key) {
      state.sort.direction = state.sort.direction === "asc" ? "desc" : "asc";
    } else {
      state.sort = { key, direction: "asc" };
    }
    renderMembersTable();
  }

  function handleRowAction(action, id) {
    const record = findRecord(id);
    if (!record) return;

    if (action === "view") {
      renderProfile(id);
      showSection("profile");
    }
    if (action === "edit") editRecord(id);
    if (action === "delete") confirmDelete(id);
    if (action === "export") exportMemberRecords([record], `${safeFilename(record.memberId)}.csv`);
    if (action === "print") printProfile(id);
  }

  function renderMembersTable() {
    const body = $("#membersTableBody");
    const records = applyTableFilters().sort(compareRecords);
    state.visibleRecords = records;
    body.innerHTML = "";

    records.forEach((record) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td><input class="row-select" type="checkbox" value="${escapeAttribute(record.id)}" ${state.selectedIds.has(record.id) ? "checked" : ""} aria-label="Select ${escapeAttribute(record.fullName)}"></td>
        <td>${escapeHtml(record.memberId)}</td>
        <td><strong>${escapeHtml(record.fullName)}</strong><br><span class="muted">${escapeHtml(record.email || "No email")}</span></td>
        <td><span class="badge">${escapeHtml(record.membershipStatus || "Unspecified")}</span></td>
        <td>${escapeHtml(record.age)}</td>
        <td>${escapeHtml(record.gender)}</td>
        <td>${escapeHtml(record.mobile)}</td>
        <td>${escapeHtml(record.household || "No household")}</td>
        <td>${escapeHtml(record.ministry || "None")}</td>
        <td>
          <div class="row-actions">
            <button class="button ghost" type="button" data-row-action="view" data-id="${escapeAttribute(record.id)}">View</button>
            <button class="button ghost" type="button" data-row-action="edit" data-id="${escapeAttribute(record.id)}">Edit</button>
            <button class="button danger" type="button" data-row-action="delete" data-id="${escapeAttribute(record.id)}">Delete</button>
            <button class="button ghost" type="button" data-row-action="export" data-id="${escapeAttribute(record.id)}">Export</button>
            <button class="button ghost" type="button" data-row-action="print" data-id="${escapeAttribute(record.id)}">Print</button>
          </div>
        </td>
      `;
      body.appendChild(row);
    });

    $("#visibleCount").textContent = `${records.length} visible record${records.length === 1 ? "" : "s"}`;
    $("#tableEmptyState").classList.toggle("hidden", records.length > 0);
    syncSelectAllState();
  }

  function applyTableFilters() {
    const query = normalize($("#tableSearch").value);
    const gender = $("#filterGender").value;
    const status = $("#filterStatus").value;
    const ageGroup = $("#filterAgeGroup").value;
    const civilStatus = $("#filterCivilStatus").value;
    const ministry = normalize($("#filterMinistry").value);
    const birthdayMonth = $("#filterBirthdayMonth").value;
    const anniversaryMonth = $("#filterAnniversaryMonth").value;

    return state.records.filter((record) => {
      const haystack = normalize([
        record.fullName, record.address, record.barangay, record.city, record.province,
        record.mobile, record.email, record.household, record.ministry
      ].join(" "));

      return (!query || haystack.includes(query))
        && (!gender || record.gender === gender)
        && (!status || record.membershipStatus === status)
        && (!ageGroup || getAgeGroup(record.age) === ageGroup)
        && (!civilStatus || record.civilStatus === civilStatus)
        && (!ministry || normalize(record.ministry).includes(ministry))
        && (!birthdayMonth || getMonthValue(record.birthday) === birthdayMonth)
        && (!anniversaryMonth || getMonthValue(record.anniversary) === anniversaryMonth);
    });
  }

  function compareRecords(a, b) {
    const key = state.sort.key;
    const direction = state.sort.direction === "asc" ? 1 : -1;
    const aValue = key === "age" ? Number(a[key] || 0) : normalize(a[key]);
    const bValue = key === "age" ? Number(b[key] || 0) : normalize(b[key]);
    if (aValue < bValue) return -1 * direction;
    if (aValue > bValue) return 1 * direction;
    return 0;
  }

  function syncSelectAllState() {
    const checkbox = $("#selectAllRows");
    const visibleIds = state.visibleRecords.map((record) => record.id);
    const selectedVisible = visibleIds.filter((id) => state.selectedIds.has(id));
    checkbox.checked = visibleIds.length > 0 && selectedVisible.length === visibleIds.length;
    checkbox.indeterminate = selectedVisible.length > 0 && selectedVisible.length < visibleIds.length;
  }

  function bindProfileActions() {
    $("#profileContent").addEventListener("click", (event) => {
      const button = event.target.closest("[data-profile-action]");
      if (!button) return;
      const id = button.dataset.id;
      const action = button.dataset.profileAction;
      if (action === "edit") editRecord(id);
      if (action === "delete") confirmDelete(id);
      if (action === "print") printProfile(id);
      if (action === "export") {
        const record = findRecord(id);
        if (record) exportMemberRecords([record], `${safeFilename(record.memberId)}.csv`);
      }
      if (action === "back") showSection("members");
    });
  }

  function renderProfile(id = state.activeProfileId) {
    const container = $("#profileContent");
    const record = findRecord(id);
    state.activeProfileId = record ? record.id : "";

    if (!record) {
      container.className = "profile-empty";
      container.innerHTML = `
        <h3>No profile selected</h3>
        <p>Open a member profile from the Members Table or after saving a record.</p>
        <button class="button primary" type="button" data-section-target="members">Go to Members Table</button>
      `;
      $("[data-section-target='members']", container).addEventListener("click", () => showSection("members"));
      return;
    }

    container.className = "profile-card";
    container.innerHTML = `
      <div class="profile-header">
        <div class="logo-placeholder"><span>Church<br>Logo</span></div>
        <div>
          <p>${escapeHtml(state.settings.churchName)}</p>
          <h3>${escapeHtml(record.fullName)}</h3>
          <p>Member ID: ${escapeHtml(record.memberId)} | ${escapeHtml(record.membershipStatus || "Unspecified")}</p>
        </div>
        <div class="profile-actions no-print">
          <button class="button ghost" type="button" data-profile-action="back" data-id="${escapeAttribute(record.id)}">Back to Table</button>
          <button class="button secondary" type="button" data-profile-action="edit" data-id="${escapeAttribute(record.id)}">Edit</button>
          <button class="button danger" type="button" data-profile-action="delete" data-id="${escapeAttribute(record.id)}">Delete</button>
          <button class="button ghost" type="button" data-profile-action="print" data-id="${escapeAttribute(record.id)}">Print</button>
          <button class="button ghost" type="button" data-profile-action="export" data-id="${escapeAttribute(record.id)}">Export CSV</button>
        </div>
      </div>
      <div class="profile-body">
        ${detailSection("Personal Information", [
          ["Full Name", record.fullName],
          ["Nickname / Preferred Name", record.nickname],
          ["Birthday and Age", `${formatDate(record.birthday)} (${record.age || "N/A"})`],
          ["Gender", record.gender],
          ["Civil Status", record.civilStatus],
          ["Wedding Anniversary", formatDate(record.anniversary)],
          ["Spouse Name", record.spouseName]
        ])}
        ${detailSection("Contact and Address", [
          ["Mobile Number", record.mobile],
          ["Email Address", record.email],
          ["Complete Address", record.address],
          ["Barangay", record.barangay],
          ["City", record.city],
          ["Province", record.province]
        ])}
        ${detailSection("Church Membership", [
          ["Membership Status", record.membershipStatus],
          ["Baptism Status", record.baptismStatus],
          ["Date Joined / First Visit", formatDate(record.dateJoined)],
          ["Ministry Involvement", record.ministry],
          ["Role / Service Label", record.role],
          ["Cell Group / Bible Study Group", record.cellGroup],
          ["Household / Family Group", record.household]
        ])}
        ${detailSection("Emergency Contact and Notes", [
          ["Emergency Contact Name", record.emergencyName],
          ["Emergency Contact Number", record.emergencyMobile],
          ["Notes / Remarks", record.notes],
          ["Created Date", formatDateTime(record.createdAt)],
          ["Last Updated Date", formatDateTime(record.updatedAt)]
        ])}
        <div class="detail-section">
          <h4>Household / Family Members</h4>
          ${familyProfileTable(record.familyMembers)}
        </div>
      </div>
    `;
  }

  function detailSection(title, items) {
    return `
      <div class="detail-section">
        <h4>${escapeHtml(title)}</h4>
        <div class="detail-grid">
          ${items.map(([label, value]) => `
            <div class="detail-item">
              <span>${escapeHtml(label)}</span>
              <strong>${escapeHtml(displayValue(value))}</strong>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function familyProfileTable(familyMembers) {
    if (!familyMembers.length) {
      return `<div class="empty-state"><h4>No family members recorded</h4><p>This profile has no household members listed.</p></div>`;
    }
    return `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Full Name</th>
              <th>Relationship</th>
              <th>Birthday</th>
              <th>Age</th>
              <th>Gender</th>
              <th>Mobile</th>
              <th>Email</th>
              <th>Church Member?</th>
              <th>Linked Member ID</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${familyMembers.map((member) => `
              <tr>
                <td>${escapeHtml(member.fullName)}</td>
                <td>${escapeHtml(member.relationship)}</td>
                <td>${escapeHtml(formatDate(member.birthday))}</td>
                <td>${escapeHtml(member.age)}</td>
                <td>${escapeHtml(member.gender)}</td>
                <td>${escapeHtml(member.mobile)}</td>
                <td>${escapeHtml(member.email)}</td>
                <td>${member.isChurchMember ? "Yes" : "No"}</td>
                <td>${escapeHtml(member.linkedMemberId)}</td>
                <td>${escapeHtml(member.notes)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function bindDashboardActions() {
    $("#exportDashboardButton").addEventListener("click", exportDashboardSummary);
    $("#printDashboardButton").addEventListener("click", printDashboardReport);
    $("#quickBackupButton").addEventListener("click", async () => {
      await exportFullBackup(true);
    });
  }

  function renderDashboard() {
    const stats = computeStats(state.records);
    const cards = [
      ["Total people recorded", stats.totalPeople, "Primary records plus family members"],
      ["Total church members", stats.statusCounts.Member || 0, "Primary records marked Member"],
      ["Total regular attendees", stats.statusCounts["Regular Attendee"] || 0, "Primary records"],
      ["Total visitors", stats.statusCounts.Visitor || 0, "Primary records"],
      ["Total inactive members", stats.statusCounts.Inactive || 0, "Primary records"],
      ["Total male", stats.genderCounts.Male || 0, "All recorded people"],
      ["Total female", stats.genderCounts.Female || 0, "All recorded people"],
      ["Total households / families", stats.totalHouseholds, "Grouped by household name"],
      ["Total children", stats.ageCounts.Children || 0, "0-12 years old"],
      ["Total youth", stats.ageCounts.Youth || 0, "13-17 years old"],
      ["Total young adults", stats.ageCounts["Young Adult"] || 0, "18-30 years old"],
      ["Total adults", stats.ageCounts.Adult || 0, "31-59 years old"],
      ["Total seniors", stats.ageCounts.Senior || 0, "60+ years old"],
      ["Birthdays this month", stats.birthdaysThisMonth, "Members and family members"],
      ["Anniversaries this month", stats.anniversariesThisMonth, "Wedding anniversaries"]
    ];

    $("#dashboardCards").innerHTML = cards.map(([label, value, note]) => `
      <div class="summary-card">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <small>${escapeHtml(note)}</small>
      </div>
    `).join("");

    renderChart("statusChart", stats.statusCounts);
    renderChart("genderChart", stats.genderCounts);
    renderChart("ageChart", stats.ageCounts);
    renderChart("ministryChart", stats.ministryCounts);
    renderChart("civilChart", stats.civilCounts);
    renderChart("householdChart", stats.householdCounts);
  }

  function renderChart(elementId, counts) {
    const entries = Object.entries(counts)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const total = entries.reduce((sum, [, count]) => sum + count, 0) || 1;
    const container = $(`#${elementId}`);

    if (!entries.length) {
      container.innerHTML = `<p class="helper-text">No data yet.</p>`;
      return;
    }

    container.innerHTML = entries.map(([label, count]) => {
      const width = Math.max((count / total) * 100, 4);
      return `
        <div class="chart-row">
          <span class="chart-label" title="${escapeAttribute(label)}">${escapeHtml(label)}</span>
          <span class="chart-track"><span class="chart-fill" style="width:${width}%"></span></span>
          <span class="chart-count">${count}</span>
        </div>
      `;
    }).join("");
  }

  function computeStats(records) {
    const people = flattenPeople(records);
    const statusCounts = countBy(records, (record) => record.membershipStatus || "Unspecified");
    const genderCounts = countBy(people, (person) => person.gender || "Unspecified");
    const ageCounts = countBy(people, (person) => getAgeGroup(person.age) || "Unknown");
    const civilCounts = countBy(records, (record) => record.civilStatus || "Unspecified");
    const householdCounts = countBy(records, (record) => record.household || "No household");
    const ministryCounts = {};

    records.forEach((record) => {
      const ministries = splitMinistries(record.ministry);
      if (!ministries.length) ministries.push("None");
      ministries.forEach((ministry) => {
        ministryCounts[ministry] = (ministryCounts[ministry] || 0) + 1;
      });
    });

    return {
      totalPeople: people.length,
      totalHouseholds: getHouseholdKeys(records).size,
      birthdaysThisMonth: people.filter((person) => isMonth(person.birthday, currentMonthValue())).length,
      anniversariesThisMonth: records.filter((record) => isMonth(record.anniversary, currentMonthValue())).length,
      statusCounts,
      genderCounts,
      ageCounts,
      civilCounts,
      householdCounts,
      ministryCounts
    };
  }

  function bindReportActions() {
    $("#generateReportButton").addEventListener("click", generateReport);
    $("#exportReportButton").addEventListener("click", exportCurrentReport);
    $("#printReportButton").addEventListener("click", printCurrentReport);
    $("#resetReportFiltersButton").addEventListener("click", () => {
      [
        "#reportDateFrom", "#reportDateTo", "#reportStatus", "#reportGender",
        "#reportAgeGroup", "#reportMinistry", "#reportBirthdayMonth",
        "#reportAnniversaryMonth", "#reportHousehold"
      ].forEach((selector) => {
        $(selector).value = "";
      });
      $("#reportType").value = "total";
      generateReport();
    });
  }

  function generateReport() {
    const filters = getReportFilters();
    const report = buildReport(filters);
    state.latestReport = report;
    renderReport(report);
  }

  function getReportFilters() {
    return {
      type: $("#reportType").value,
      dateFrom: $("#reportDateFrom").value,
      dateTo: $("#reportDateTo").value,
      status: $("#reportStatus").value,
      gender: $("#reportGender").value,
      ageGroup: $("#reportAgeGroup").value,
      ministry: $("#reportMinistry").value.trim(),
      birthdayMonth: $("#reportBirthdayMonth").value,
      anniversaryMonth: $("#reportAnniversaryMonth").value,
      household: $("#reportHousehold").value.trim()
    };
  }

  function buildReport(filters) {
    let records = filterRecordsForReport(state.records, filters);
    let title = reportTitle(filters.type);

    if (filters.type === "active") records = records.filter((record) => record.membershipStatus === "Member");
    if (filters.type === "inactive") records = records.filter((record) => record.membershipStatus === "Inactive");
    if (filters.type === "visitors") records = records.filter((record) => record.membershipStatus === "Visitor");
    if (filters.type === "attendees") records = records.filter((record) => record.membershipStatus === "Regular Attendee");
    if (filters.type === "birthdays") {
      const month = filters.birthdayMonth || currentMonthValue();
      records = records.filter((record) => isMonth(record.birthday, month));
      title += filters.birthdayMonth ? "" : " - This Month";
    }
    if (filters.type === "anniversaries") {
      const month = filters.anniversaryMonth || currentMonthValue();
      records = records.filter((record) => isMonth(record.anniversary, month));
      title += filters.anniversaryMonth ? "" : " - This Month";
    }
    if (filters.type === "new") {
      records = records.filter((record) => ["Member", "Visitor", "Regular Attendee"].includes(record.membershipStatus));
      records = records.sort((a, b) => String(b.dateJoined).localeCompare(String(a.dateJoined)));
    }
    if (filters.type === "missing") {
      records = records.filter(hasMissingInformation);
    }

    const summaryRows = buildSummaryRows(filters.type, records);
    const detailRows = records.map(reportRecordRow);

    return {
      title,
      generatedAt: nowIso(),
      filters,
      records,
      summaryRows,
      detailHeaders: [
        "Member ID", "Full Name", "Status", "Gender", "Age", "Civil Status",
        "Mobile", "Email", "Household", "Ministry", "Date Joined", "Birthday",
        "Anniversary"
      ],
      detailRows
    };
  }

  function filterRecordsForReport(records, filters) {
    return records.filter((record) => {
      const joined = record.dateJoined || "";
      return (!filters.dateFrom || joined >= filters.dateFrom)
        && (!filters.dateTo || joined <= filters.dateTo)
        && (!filters.status || record.membershipStatus === filters.status)
        && (!filters.gender || record.gender === filters.gender)
        && (!filters.ageGroup || getAgeGroup(record.age) === filters.ageGroup)
        && (!filters.ministry || normalize(record.ministry).includes(normalize(filters.ministry)))
        && (!filters.birthdayMonth || getMonthValue(record.birthday) === filters.birthdayMonth)
        && (!filters.anniversaryMonth || getMonthValue(record.anniversary) === filters.anniversaryMonth)
        && (!filters.household || normalize(record.household).includes(normalize(filters.household)));
    });
  }

  function buildSummaryRows(type, records) {
    const stats = computeStats(records);
    if (type === "gender") return objectToRows(stats.genderCounts);
    if (type === "age") return objectToRows(stats.ageCounts);
    if (type === "household") return objectToRows(stats.householdCounts);
    if (type === "ministry") return objectToRows(stats.ministryCounts);
    return [
      ["Total primary records", records.length],
      ["Total people including family members", stats.totalPeople],
      ["Total households / families", stats.totalHouseholds],
      ["Members", stats.statusCounts.Member || 0],
      ["Regular attendees", stats.statusCounts["Regular Attendee"] || 0],
      ["Visitors", stats.statusCounts.Visitor || 0],
      ["Inactive", stats.statusCounts.Inactive || 0],
      ["Male", stats.genderCounts.Male || 0],
      ["Female", stats.genderCounts.Female || 0],
      ["Children", stats.ageCounts.Children || 0],
      ["Youth", stats.ageCounts.Youth || 0],
      ["Young Adult", stats.ageCounts["Young Adult"] || 0],
      ["Adult", stats.ageCounts.Adult || 0],
      ["Senior", stats.ageCounts.Senior || 0]
    ];
  }

  function renderReport(report) {
    const filters = reportFilterLabels(report.filters);
    $("#reportOutput").innerHTML = `
      <div class="report-header">
        <div class="report-brand">
          <div class="logo-placeholder"><span>Church<br>Logo</span></div>
          <div>
            <h4>${escapeHtml(state.settings.churchName)}</h4>
            <p class="helper-text">Church Membership Census System</p>
          </div>
        </div>
        <div class="report-meta">
          <h3>${escapeHtml(report.title)}</h3>
          <div>Date generated: ${escapeHtml(formatDateTime(report.generatedAt))}</div>
        </div>
      </div>
      <div class="report-filters">
        ${filters.length ? filters.map((filter) => `<span>${escapeHtml(filter)}</span>`).join("") : "<span>No filters applied</span>"}
      </div>
      <h4>Summary Totals</h4>
      ${simpleTable(["Label", "Total"], report.summaryRows)}
      <h4>Detailed Records</h4>
      ${report.detailRows.length ? simpleTable(report.detailHeaders, report.detailRows) : `<div class="empty-state"><h4>No records found</h4><p>This report has no matching records.</p></div>`}
    `;
  }

  function simpleTable(headers, rows) {
    return `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>${row.map((cell) => `<td>${escapeHtml(displayValue(cell))}</td>`).join("")}</tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function bindImportExportActions() {
    $("#exportAllMembersButton").addEventListener("click", () => exportMemberRecords(state.records, "members.csv"));
    $("#exportFamilyMembersButton").addEventListener("click", () => exportFamilyMembers(state.records, "family_members.csv"));
    $("#exportHouseholdsButton").addEventListener("click", () => exportHouseholds(state.records, "households.csv"));
    $("#exportFullBackupButton").addEventListener("click", () => exportFullBackup(false));
    $("#saveBackupFileButton").addEventListener("click", () => exportFullBackup(true));
    $("#importCsvButton").addEventListener("click", handleImport);
  }

  function bindSettingsActions() {
    $("#saveSettingsButton").addEventListener("click", () => {
      state.settings.churchName = $("#settingsChurchName").value.trim() || DEFAULT_CHURCH_NAME;
      saveSettings();
      applySettings();
      renderProfile();
      renderReport(state.latestReport || buildReport(getReportFilters()));
      showToast("Settings saved.");
    });

    $("#darkModeToggle").addEventListener("change", (event) => {
      state.settings.darkMode = event.target.checked;
      saveSettings();
      applySettings();
    });

    $("#compactModeToggle").addEventListener("change", (event) => {
      state.settings.compactMode = event.target.checked;
      saveSettings();
      applySettings();
    });

    $("#resetThemeButton").addEventListener("click", () => {
      state.settings.darkMode = false;
      state.settings.compactMode = false;
      saveSettings();
      applySettings();
      showToast("Theme reset.");
    });

    $("#changePasswordButton").addEventListener("click", handlePasswordChange);

    $("#openPublicRegistrationButton").addEventListener("click", () => {
      window.open(getPublicRegistrationUrl(), "_blank", "noopener");
    });

    $("#copyPublicRegistrationButton").addEventListener("click", async () => {
      const url = getPublicRegistrationUrl();
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
        } else {
          const input = $("#publicRegistrationUrl");
          input.select();
          document.execCommand("copy");
        }
        showToast("Public registration link copied.");
      } catch (error) {
        console.error(error);
        showToast("Could not copy the link. Select and copy it manually.", "error");
      }
    });

    $("#settingsExportButton").addEventListener("click", () => exportFullBackup(true));
    $("#settingsImportButton").addEventListener("click", () => {
      showSection("importExport");
      $("#membersImportFile").focus();
    });
    $("#clearAllDataButton").addEventListener("click", () => {
      confirmAction(
        "Clear All Data",
        "This will permanently remove all census records saved in this browser. Export a backup first if you need one.",
        () => {
          state.records = [];
          state.selectedIds.clear();
          saveRecords();
          resetForm();
          renderAll();
          showToast("All local census data has been cleared.");
        }
      );
    });
  }

  async function handlePasswordChange() {
    const currentPassword = $("#currentPassword").value;
    const newPassword = $("#newPassword").value;
    const confirmPassword = $("#confirmNewPassword").value;

    if (!await verifyAdminPassword(currentPassword)) {
      showToast("Current password is incorrect.", "error");
      return;
    }
    if (newPassword.length < 6) {
      showToast("New password must be at least 6 characters.", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("New password confirmation does not match.", "error");
      return;
    }

    state.settings.passwordHash = await hashPassword(newPassword);
    saveSettings();
    $("#currentPassword").value = "";
    $("#newPassword").value = "";
    $("#confirmNewPassword").value = "";
    showToast("Admin password changed.");
  }

  function exportMemberRecords(records, filename) {
    if (!records.length) {
      showToast("No records to export.", "error");
      return;
    }
    const rows = records.map(recordToMemberCsvRow);
    downloadCsv(filename, toCsv(MEMBER_HEADERS, rows));
    showToast(`${records.length} record${records.length === 1 ? "" : "s"} exported.`);
  }

  function exportFamilyMembers(records, filename) {
    const rows = [];
    records.forEach((record) => {
      record.familyMembers.forEach((member) => {
        rows.push(recordToFamilyCsvRow(record, member));
      });
    });
    if (!rows.length) {
      showToast("No family member records to export.", "error");
      return;
    }
    downloadCsv(filename, toCsv(FAMILY_HEADERS, rows));
    showToast(`${rows.length} family member row${rows.length === 1 ? "" : "s"} exported.`);
  }

  function exportHouseholds(records, filename) {
    const households = {};
    records.forEach((record) => {
      const name = record.household || "No household";
      if (!households[name]) {
        households[name] = {
          "Household / Family Group Name": name,
          "Primary Member Count": 0,
          "Family Member Count": 0,
          "Church Member Count": 0,
          "People Count": 0,
          "Primary Member Names": ""
        };
      }
      households[name]["Primary Member Count"] += 1;
      households[name]["Family Member Count"] += record.familyMembers.length;
      households[name]["Church Member Count"] += record.membershipStatus === "Member" ? 1 : 0;
      households[name]["People Count"] += 1 + record.familyMembers.length;
      households[name]["Primary Member Names"] = [
        households[name]["Primary Member Names"],
        record.fullName
      ].filter(Boolean).join("; ");
    });

    const headers = [
      "Household / Family Group Name", "Primary Member Count", "Family Member Count",
      "Church Member Count", "People Count", "Primary Member Names"
    ];
    const rows = Object.values(households);
    downloadCsv(filename, toCsv(headers, rows));
    showToast(`${rows.length} household row${rows.length === 1 ? "" : "s"} exported.`);
  }

  async function exportFullBackup(useFilePicker) {
    if (!state.records.length) {
      showToast("No records to back up.", "error");
      return;
    }
    const csv = toCsv(MEMBER_HEADERS, state.records.map(recordToMemberCsvRow));
    const saved = useFilePicker
      ? await saveCsvFile("full_backup.csv", csv)
      : downloadCsv("full_backup.csv", csv);

    if (saved !== false) {
      state.settings.lastBackupAt = nowIso();
      saveSettings();
      renderLastBackup();
      showToast("Full backup exported.");
    }
  }

  function exportDashboardSummary() {
    const stats = computeStats(state.records);
    const rows = dashboardRows(stats).map(([label, total]) => ({ Label: label, Total: total }));
    downloadCsv("dashboard_summary.csv", toCsv(["Label", "Total"], rows));
    showToast("Dashboard summary exported.");
  }

  function dashboardRows(stats) {
    return [
      ["Total people recorded", stats.totalPeople],
      ["Total church members", stats.statusCounts.Member || 0],
      ["Total regular attendees", stats.statusCounts["Regular Attendee"] || 0],
      ["Total visitors", stats.statusCounts.Visitor || 0],
      ["Total inactive members", stats.statusCounts.Inactive || 0],
      ["Total male", stats.genderCounts.Male || 0],
      ["Total female", stats.genderCounts.Female || 0],
      ["Total households / families", stats.totalHouseholds],
      ["Total children", stats.ageCounts.Children || 0],
      ["Total youth", stats.ageCounts.Youth || 0],
      ["Total young adults", stats.ageCounts["Young Adult"] || 0],
      ["Total adults", stats.ageCounts.Adult || 0],
      ["Total seniors", stats.ageCounts.Senior || 0],
      ["Upcoming birthdays this month", stats.birthdaysThisMonth],
      ["Upcoming wedding anniversaries this month", stats.anniversariesThisMonth]
    ];
  }

  function printDashboardReport() {
    const stats = computeStats(state.records);
    const html = `
      <div class="report-output">
        <div class="report-header">
          <div class="report-brand">
            <div class="logo-placeholder"><span>Church<br>Logo</span></div>
            <div>
              <h4>${escapeHtml(state.settings.churchName)}</h4>
              <p class="helper-text">Church Membership Census System</p>
            </div>
          </div>
          <div class="report-meta">
            <h3>Dashboard Summary Report</h3>
            <div>Date generated: ${escapeHtml(formatDateTime(nowIso()))}</div>
          </div>
        </div>
        ${simpleTable(["Label", "Total"], dashboardRows(stats))}
      </div>
    `;
    printHtml("Dashboard Summary Report", html);
  }

  function printProfile(id) {
    renderProfile(id);
    const node = $("#profileContent").cloneNode(true);
    $$(".no-print", node).forEach((item) => item.remove());
    printHtml("Individual Member Profile", node.outerHTML);
  }

  function exportCurrentReport() {
    if (!state.latestReport) {
      showToast("Generate a report before exporting.", "error");
      return;
    }
    downloadCsv(`${safeFilename(state.latestReport.title)}.csv`, reportToCsv(state.latestReport));
    showToast("Report exported.");
  }

  function printCurrentReport() {
    if (!state.latestReport) {
      showToast("Generate a report before printing.", "error");
      return;
    }
    printHtml(state.latestReport.title, $("#reportOutput").outerHTML);
  }

  async function handleImport() {
    const memberFile = $("#membersImportFile").files[0];
    const familyFile = $("#familyImportFile").files[0];

    if (!memberFile && !familyFile) {
      showToast("Choose at least one CSV file to import.", "error");
      return;
    }

    const workingRecords = state.records.map((record) => normalizeRecord(record));
    const results = {
      totalRows: 0,
      imported: 0,
      skipped: 0,
      duplicates: 0,
      errors: []
    };

    try {
      if (memberFile) {
        const text = await memberFile.text();
        importMembersCsv(text, workingRecords, results);
      }
      if (familyFile) {
        const text = await familyFile.text();
        importFamilyCsv(text, workingRecords, results);
      }

      state.records = workingRecords;
      saveRecords();
      renderAll();
      renderImportResults(results);
      showToast(`Import complete. ${results.imported} row${results.imported === 1 ? "" : "s"} imported.`);
    } catch (error) {
      console.error(error);
      showToast(error.message || "Import failed.", "error");
    }
  }

  function importMembersCsv(text, workingRecords, results) {
    const parsed = parseCsv(text);
    if (parsed.rows.length === 0) throw new Error("Members CSV has no data rows.");
    const missingHeaders = ["Full Name", "Birthday", "Mobile Number"].filter((header) => !parsed.headers.includes(header));
    if (missingHeaders.length) {
      throw new Error(`Members CSV is missing required column(s): ${missingHeaders.join(", ")}`);
    }

    parsed.rows.forEach((row) => {
      results.totalRows += 1;
      try {
        const record = csvRowToRecord(row, workingRecords);
        if (!record.fullName || !record.birthday || !record.mobile) {
          results.skipped += 1;
          results.errors.push(`Row ${results.totalRows}: missing Full Name, Birthday, or Mobile Number.`);
          return;
        }

        const rowErrors = validateImportedRecord(record);
        if (rowErrors.length) {
          results.skipped += 1;
          results.errors.push(`Row ${results.totalRows}: ${rowErrors.join(" ")}`);
          return;
        }

        if (workingRecords.some((item) => item.id === record.id || duplicateKey(item) === duplicateKey(record))) {
          results.duplicates += 1;
          results.skipped += 1;
          return;
        }

        workingRecords.push(record);
        results.imported += 1;
      } catch (error) {
        results.skipped += 1;
        results.errors.push(`Row ${results.totalRows}: ${error.message}`);
      }
    });
  }

  function importFamilyCsv(text, workingRecords, results) {
    const parsed = parseCsv(text);
    if (parsed.rows.length === 0) return;
    const missingHeaders = ["Member ID", "Full Name"].filter((header) => !parsed.headers.includes(header));
    if (missingHeaders.length) {
      throw new Error(`Family CSV is missing required column(s): ${missingHeaders.join(", ")}`);
    }

    parsed.rows.forEach((row, index) => {
      results.totalRows += 1;
      const memberId = row["Member ID"] || "";
      const parent = workingRecords.find((record) => record.memberId === memberId || record.id === memberId);
      if (!parent) {
        results.skipped += 1;
        results.errors.push(`Family row ${index + 1}: no matching Member ID ${memberId}.`);
        return;
      }

      const familyMember = normalizeFamilyMember({
        id: row["Family Member ID"] || makeId("FM"),
        fullName: row["Full Name"] || "",
        relationship: row.Relationship || "",
        birthday: row.Birthday || "",
        gender: row.Gender || "",
        mobile: row["Mobile Number"] || "",
        email: row["Email Address"] || "",
        isChurchMember: row["Is Church Member"] === "Yes",
        linkedMemberId: row["Linked Member ID"] || "",
        notes: row.Notes || ""
      });

      if (!familyMember.fullName) {
        results.skipped += 1;
        results.errors.push(`Family row ${index + 1}: missing Full Name.`);
        return;
      }

      const exists = parent.familyMembers.some((item) => duplicateFamilyKey(item) === duplicateFamilyKey(familyMember));
      if (exists) {
        results.duplicates += 1;
        results.skipped += 1;
        return;
      }

      parent.familyMembers.push(familyMember);
      parent.updatedAt = nowIso();
      results.imported += 1;
    });
  }

  function csvRowToRecord(row, workingRecords = state.records) {
    let familyMembers = [];
    const familyJson = row["Family Members JSON"] || "";
    if (familyJson.trim()) {
      try {
        const parsed = JSON.parse(familyJson);
        familyMembers = Array.isArray(parsed) ? parsed.map(normalizeFamilyMember) : [];
      } catch (error) {
        throw new Error("Family Members JSON is invalid.");
      }
    }

    const importedId = row["Member ID"] || generateMemberId(workingRecords);

    return normalizeRecord({
      id: importedId,
      memberId: importedId,
      fullName: row["Full Name"] || "",
      nickname: row["Nickname / Preferred Name"] || "",
      address: row["Complete Address"] || "",
      barangay: row.Barangay || "",
      city: row.City || "",
      province: row.Province || "",
      mobile: row["Mobile Number"] || "",
      email: row["Email Address"] || "",
      birthday: row.Birthday || "",
      gender: row.Gender || "",
      civilStatus: row["Civil Status"] || "",
      anniversary: row["Wedding Anniversary Date"] || "",
      spouseName: row["Spouse Name"] || "",
      household: row["Household / Family Group Name"] || "",
      emergencyName: row["Emergency Contact Name"] || "",
      emergencyMobile: row["Emergency Contact Number"] || "",
      membershipStatus: row["Membership Status"] || "",
      baptismStatus: row["Baptism Status"] || "",
      dateJoined: row["Date Joined / First Visit Date"] || "",
      ministry: row["Ministry Involvement"] || "",
      role: row["Role / Service Label"] || "",
      cellGroup: row["Cell Group / Bible Study Group"] || "",
      notes: row["Notes / Remarks"] || "",
      consent: row["Data Privacy Consent"] === "Yes" || row["Data Privacy Consent"] === "true",
      familyMembers,
      createdAt: row["Created Date"] || nowIso(),
      updatedAt: row["Last Updated Date"] || nowIso()
    });
  }

  function validateImportedRecord(record) {
    const errors = [];
    if (record.mobile && !isValidPhone(record.mobile)) errors.push("Mobile number format is invalid.");
    if (record.email && !isValidEmail(record.email)) errors.push("Email address format is invalid.");
    if (record.birthday && !isValidPastOrTodayDate(record.birthday)) errors.push("Birthday is invalid or in the future.");
    record.familyMembers.forEach((member, index) => {
      if (!member.fullName) errors.push(`Family member ${index + 1} is missing Full Name.`);
      if (member.mobile && !isValidPhone(member.mobile)) errors.push(`Family member ${index + 1} has an invalid mobile number.`);
      if (member.email && !isValidEmail(member.email)) errors.push(`Family member ${index + 1} has an invalid email address.`);
      if (member.birthday && !isValidPastOrTodayDate(member.birthday)) errors.push(`Family member ${index + 1} has an invalid birthday.`);
    });
    return errors;
  }

  function renderImportResults(results) {
    $("#importResults").innerHTML = `
      <strong>Import results</strong>
      <ul>
        <li>Total rows found: ${results.totalRows}</li>
        <li>Records imported: ${results.imported}</li>
        <li>Rows skipped: ${results.skipped}</li>
        <li>Duplicates found: ${results.duplicates}</li>
        <li>Errors found: ${results.errors.length}</li>
      </ul>
      ${results.errors.length ? `<details><summary>Show errors</summary><ul>${results.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul></details>` : ""}
    `;
  }

  function recordToMemberCsvRow(record) {
    return {
      "Member ID": record.memberId,
      "Full Name": record.fullName,
      "Nickname / Preferred Name": record.nickname,
      "Complete Address": record.address,
      Barangay: record.barangay,
      City: record.city,
      Province: record.province,
      "Mobile Number": record.mobile,
      "Email Address": record.email,
      Birthday: record.birthday,
      Age: calculateAge(record.birthday),
      Gender: record.gender,
      "Civil Status": record.civilStatus,
      "Wedding Anniversary Date": record.anniversary,
      "Spouse Name": record.spouseName,
      "Household / Family Group Name": record.household,
      "Emergency Contact Name": record.emergencyName,
      "Emergency Contact Number": record.emergencyMobile,
      "Membership Status": record.membershipStatus,
      "Baptism Status": record.baptismStatus,
      "Date Joined / First Visit Date": record.dateJoined,
      "Ministry Involvement": record.ministry,
      "Role / Service Label": record.role,
      "Cell Group / Bible Study Group": record.cellGroup,
      "Notes / Remarks": record.notes,
      "Data Privacy Consent": record.consent ? "Yes" : "No",
      "Family Members JSON": JSON.stringify(record.familyMembers || []),
      "Created Date": record.createdAt,
      "Last Updated Date": record.updatedAt
    };
  }

  function recordToFamilyCsvRow(record, member) {
    return {
      "Member ID": record.memberId,
      "Member Name": record.fullName,
      "Household / Family Group Name": record.household,
      "Family Member ID": member.id,
      "Full Name": member.fullName,
      Relationship: member.relationship,
      Birthday: member.birthday,
      Age: calculateAge(member.birthday),
      Gender: member.gender,
      "Mobile Number": member.mobile,
      "Email Address": member.email,
      "Is Church Member": member.isChurchMember ? "Yes" : "No",
      "Linked Member ID": member.linkedMemberId,
      Notes: member.notes
    };
  }

  function reportRecordRow(record) {
    return [
      record.memberId,
      record.fullName,
      record.membershipStatus,
      record.gender,
      record.age,
      record.civilStatus,
      record.mobile,
      record.email,
      record.household,
      record.ministry,
      formatDate(record.dateJoined),
      formatDate(record.birthday),
      formatDate(record.anniversary)
    ];
  }

  function reportToCsv(report) {
    const lines = [
      [report.title],
      ["Church Name", state.settings.churchName],
      ["Date Generated", formatDateTime(report.generatedAt)],
      [],
      ["Applied Filters", reportFilterLabels(report.filters).join("; ") || "No filters applied"],
      [],
      ["Summary Totals"],
      ["Label", "Total"],
      ...report.summaryRows,
      [],
      ["Detailed Records"],
      report.detailHeaders,
      ...report.detailRows
    ];
    return lines.map((line) => line.map(csvCell).join(",")).join("\r\n");
  }

  function toCsv(headers, rows) {
    const csvRows = [headers];
    rows.forEach((row) => {
      csvRows.push(headers.map((header) => row[header] ?? ""));
    });
    return csvRows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  }

  function csvCell(value) {
    const text = String(value ?? "");
    if (/[",\r\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function parseCsv(text) {
    const input = String(text || "").replace(/^\uFEFF/, "");
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let index = 0; index < input.length; index += 1) {
      const char = input[index];
      const next = input[index + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        row.push(cell);
        cell = "";
      } else if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") index += 1;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }

    row.push(cell);
    rows.push(row);

    const nonEmptyRows = rows.filter((items) => items.some((item) => String(item).trim() !== ""));
    const headers = (nonEmptyRows.shift() || []).map((header) => header.trim());
    const dataRows = nonEmptyRows.map((items) => {
      const object = {};
      headers.forEach((header, index) => {
        object[header] = items[index] ?? "";
      });
      return object;
    });

    return { headers, rows: dataRows };
  }

  function downloadCsv(filename, csv) {
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return true;
  }

  async function saveCsvFile(filename, csv) {
    if (!window.showSaveFilePicker) {
      downloadCsv(filename, csv);
      return true;
    }

    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: "CSV file",
          accept: { "text/csv": [".csv"] }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write("\uFEFF" + csv);
      await writable.close();
      return true;
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error(error);
        showToast("Browser file saving failed. Using regular download instead.", "error");
        downloadCsv(filename, csv);
        return true;
      }
      return false;
    }
  }

  function bindConfirmModal() {
    $("#cancelConfirmButton").addEventListener("click", closeConfirmModal);
    $("#acceptConfirmButton").addEventListener("click", () => {
      if (typeof state.confirmAction === "function") state.confirmAction();
      closeConfirmModal();
    });
    $("#confirmModal").addEventListener("click", (event) => {
      if (event.target.id === "confirmModal") closeConfirmModal();
    });
  }

  function confirmAction(title, message, action) {
    $("#confirmTitle").textContent = title;
    $("#confirmMessage").textContent = message;
    state.confirmAction = action;
    $("#confirmModal").classList.remove("hidden");
    $("#cancelConfirmButton").focus();
  }

  function closeConfirmModal() {
    state.confirmAction = null;
    $("#confirmModal").classList.add("hidden");
  }

  function confirmDelete(id) {
    const record = findRecord(id);
    if (!record) return;
    confirmAction(
      "Delete Record",
      `Delete the census record for ${record.fullName}? This removes the record from this browser.`,
      () => deleteRecord(id)
    );
  }

  function deleteRecord(id) {
    state.records = state.records.filter((record) => record.id !== id);
    state.selectedIds.delete(id);
    if (state.activeProfileId === id) state.activeProfileId = "";
    saveRecords();
    resetForm();
    renderAll();
    showToast("Record deleted.");
  }

  function renderAll() {
    renderDashboard();
    renderMembersTable();
    renderProfile();
    applySettings();
    if (state.latestReport) {
      state.latestReport = buildReport(state.latestReport.filters);
      renderReport(state.latestReport);
    }
  }

  function findRecord(id) {
    return state.records.find((record) => record.id === id || record.memberId === id);
  }

  function isDuplicateRecord(record) {
    const key = duplicateKey(record);
    if (!key) return false;
    return state.records.some((item) => item.id !== record.id && duplicateKey(item) === key);
  }

  function duplicateKey(record) {
    return [
      normalize(record.fullName),
      record.birthday || "",
      digitsOnly(record.mobile)
    ].join("|");
  }

  function duplicateFamilyKey(member) {
    return [
      normalize(member.fullName),
      member.birthday || "",
      digitsOnly(member.mobile)
    ].join("|");
  }

  function calculateAge(dateValue) {
    if (!dateValue) return "";
    const date = parseLocalDate(dateValue);
    if (!date || Number.isNaN(date.getTime())) return "";
    const today = new Date();
    let age = today.getFullYear() - date.getFullYear();
    const monthDiff = today.getMonth() - date.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
      age -= 1;
    }
    return age >= 0 ? age : "";
  }

  function getAgeGroup(age) {
    const value = Number(age);
    if (!Number.isFinite(value)) return "";
    if (value <= 12) return "Children";
    if (value <= 17) return "Youth";
    if (value <= 30) return "Young Adult";
    if (value <= 59) return "Adult";
    return "Senior";
  }

  function isValidPastOrTodayDate(value) {
    const date = parseLocalDate(value);
    if (!date || Number.isNaN(date.getTime())) return false;
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return date <= today;
  }

  function parseLocalDate(value) {
    if (!value) return null;
    const parts = value.split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function getMonthValue(dateValue) {
    if (!dateValue || dateValue.length < 7) return "";
    return dateValue.slice(5, 7);
  }

  function currentMonthValue() {
    return String(new Date().getMonth() + 1).padStart(2, "0");
  }

  function isMonth(dateValue, monthValue) {
    return getMonthValue(dateValue) === monthValue;
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function isValidPhone(value) {
    const cleaned = digitsOnly(value);
    return cleaned.length >= 7 && cleaned.length <= 15 && /^[+\d\s().-]+$/.test(value);
  }

  function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function normalize(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function valueOf(selector) {
    return $(selector).value.trim();
  }

  function fieldValue(selector, root) {
    return $(selector, root).value.trim();
  }

  function formatDate(value) {
    if (!value) return "";
    const date = parseLocalDate(value);
    if (!date || Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function formatDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function generateMemberId(existingRecords = state.records) {
    const today = new Date();
    const stamp = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0")
    ].join("");
    let index = existingRecords.length + 1;
    let id = `BBCM-${stamp}-${String(index).padStart(4, "0")}`;
    while (existingRecords.some((record) => record.memberId === id || record.id === id)) {
      index += 1;
      id = `BBCM-${stamp}-${String(index).padStart(4, "0")}`;
    }
    return id;
  }

  function makeId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
  }

  function displayValue(value) {
    if (value === 0) return "0";
    return String(value || "").trim() || "N/A";
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
    setTimeout(() => {
      toast.remove();
    }, 4200);
  }

  function populateMonthSelects() {
    $$("[data-month-select]").forEach((select) => {
      const currentValue = select.value;
      select.innerHTML = `<option value="">All</option>` + MONTHS.map((month, index) => {
        const value = String(index + 1).padStart(2, "0");
        return `<option value="${value}">${month}</option>`;
      }).join("");
      select.value = currentValue;
    });
  }

  function countBy(items, getter) {
    return items.reduce((counts, item) => {
      const key = getter(item) || "Unspecified";
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
  }

  function objectToRows(object) {
    return Object.entries(object)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([label, total]) => [label, total]);
  }

  function splitMinistries(value) {
    return String(value || "")
      .split(/[;,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function flattenPeople(records) {
    const people = [];
    records.forEach((record) => {
      people.push({
        fullName: record.fullName,
        birthday: record.birthday,
        age: calculateAge(record.birthday),
        gender: record.gender,
        type: "Primary record"
      });
      record.familyMembers.forEach((member) => {
        people.push({
          fullName: member.fullName,
          birthday: member.birthday,
          age: calculateAge(member.birthday),
          gender: member.gender,
          type: "Family member"
        });
      });
    });
    return people;
  }

  function getHouseholdKeys(records) {
    const keys = new Set();
    records.forEach((record) => {
      keys.add(record.household ? normalize(record.household) : record.memberId);
    });
    return keys;
  }

  function reportTitle(type) {
    const titles = {
      total: "Total Membership Report",
      active: "Active Members Report",
      inactive: "Inactive Members Report",
      visitors: "Visitors Report",
      attendees: "Regular Attendees Report",
      gender: "Gender Summary Report",
      age: "Age Group Summary Report",
      household: "Household / Family Summary Report",
      birthdays: "Birthday Celebrants Report",
      anniversaries: "Wedding Anniversary Report",
      ministry: "Ministry Involvement Report",
      new: "New Members / First-Time Visitors Report",
      missing: "Members with Missing Information Report"
    };
    return titles[type] || "Membership Report";
  }

  function reportFilterLabels(filters) {
    const labels = [];
    if (filters.dateFrom) labels.push(`Date from: ${formatDate(filters.dateFrom)}`);
    if (filters.dateTo) labels.push(`Date to: ${formatDate(filters.dateTo)}`);
    if (filters.status) labels.push(`Status: ${filters.status}`);
    if (filters.gender) labels.push(`Gender: ${filters.gender}`);
    if (filters.ageGroup) labels.push(`Age group: ${filters.ageGroup}`);
    if (filters.ministry) labels.push(`Ministry: ${filters.ministry}`);
    if (filters.birthdayMonth) labels.push(`Birthday month: ${MONTHS[Number(filters.birthdayMonth) - 1]}`);
    if (filters.anniversaryMonth) labels.push(`Anniversary month: ${MONTHS[Number(filters.anniversaryMonth) - 1]}`);
    if (filters.household) labels.push(`Household: ${filters.household}`);
    return labels;
  }

  function hasMissingInformation(record) {
    const importantFields = [
      record.fullName, record.address, record.city, record.province, record.mobile,
      record.birthday, record.gender, record.membershipStatus, record.dateJoined,
      record.emergencyName, record.emergencyMobile
    ];
    return importantFields.some((value) => !String(value || "").trim());
  }

  function safeFilename(value) {
    const name = String(value || "export")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "_")
      .slice(0, 120);
    return name || "export";
  }

  function renderLastBackup() {
    const node = $("#lastBackupText");
    if (!node) return;
    node.textContent = state.settings.lastBackupAt
      ? `Last backup recorded: ${formatDateTime(state.settings.lastBackupAt)}`
      : "No backup recorded yet.";
  }

  function getPublicRegistrationUrl() {
    return new URL("registration.html", window.location.href).href;
  }

  function updatePublicRegistrationUrl() {
    const input = $("#publicRegistrationUrl");
    if (input) input.value = getPublicRegistrationUrl();
  }

  function printHtml(title, html) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      showToast("Print window was blocked by the browser.", "error");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${escapeHtml(title)}</title>
        <link rel="stylesheet" href="styles.css">
      </head>
      <body>
        <main class="main-content">${html}</main>
        <script>
          window.addEventListener("load", function () {
            setTimeout(function () { window.print(); }, 250);
          });
        <\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }
})();
