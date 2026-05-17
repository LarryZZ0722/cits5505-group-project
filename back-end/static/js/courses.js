/* ═══════════════════════════════════════════
   courses.js — Course Input / Browse page
═══════════════════════════════════════════ */

import API from "./utils/api.js";
import State from "./utils/state.js";
import toast from "./utils/toast.js";
import { DAYS, getColor } from "./utils/schedule-utils.js";
import { updateNavBadge } from "./utils/nav.js";
import "./utils/components.js";

let allCourses    = [];
let totalCourses  = 0;
let allTimetables = [];
let selected      = [];
let activeSems    = ["S1", "S2"];
let tablePage     = 0;
const PAGE_SIZE   = 8;
let editingCode   = null;  // code of custom unit being edited (issue #23)

document.addEventListener("DOMContentLoaded", async () => {
  const loggedIn = !!State.getUser();

  renderCourseTableSkeleton();
  if (!loggedIn) {
    document.getElementById("basketCard")?.style.setProperty("display", "none");
    document.getElementById("manualCard")?.style.setProperty("display", "none");
    document.getElementById("coursesLayout")
      ?.classList.replace("lg:grid-cols-[1fr_340px]", "lg:grid-cols-1");
    await loadCourses();
  } else {
    await Promise.all([loadCourses(), loadTimetable()]);
    renderTtSelector();
    bindTtSelector();
    bindNewTtModal();
  }

  bindFilters();
  bindSearch();
  if (loggedIn) bindManualAdd();
  if (loggedIn) bindEditModal();
  renderTable();
  if (loggedIn) renderBasket();
});

function renderCourseTableSkeleton() {
  const tbody = document.getElementById("courseTableBody");
  if (!tbody) return;

  tbody.innerHTML = Array.from({ length: PAGE_SIZE }, () => `
    <tr class="skeleton-row">
      <td><div class="skeleton skeleton-code"></div></td>
      <td>
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-subtitle"></div>
      </td>
      <td><div class="skeleton skeleton-pill"></div></td>
      <td>
        <div class="flex flex-wrap gap-1">
          <div class="skeleton skeleton-tag"></div>
          <div class="skeleton skeleton-tag"></div>
        </div>
      </td>
      <td><div class="skeleton skeleton-button"></div></td>
    </tr>
  `).join("");

  const tableCount = document.getElementById("tableCount");
  if (tableCount) tableCount.textContent = "Loading units...";

  const pagination = document.getElementById("pagination");
  if (pagination) pagination.innerHTML = "";
}


/* ── Data ────────────────────────────────── */
async function loadCourses() {
  renderCourseTableSkeleton();

  try {
    const search = document.getElementById("unitSearch")?.value || "";
    const semester = activeSems.length === 1 ? activeSems[0] : "";

    const result = await API.getCourses({
      page: tablePage,
      pageSize: PAGE_SIZE,
      semester,
      search,
    });

    allCourses = result.items || [];
    totalCourses = result.total || 0;

    if (State.getUser()) {
      try {
        const custom = await API.getCustomCourses();

        custom.forEach(c => {
          if (!allCourses.find(x => x.code === c.code)) {
            allCourses.push(c);
          }
        });
      } catch (customErr) {
        console.error("Could not load custom courses:", customErr);
      }
    }
  } catch (err) {
    console.error("Could not load unit data:", err);
    toast("Could not load unit data", "error");
    allCourses = [];
    totalCourses = 0;
  } finally {
    renderTable();
  }
}

async function loadTimetable() {
  try {
    allTimetables     = await API.getTimetables() || [];
    const savedId     = State.getActiveTimetableId();
    const match       = allTimetables.find(t => t.id === savedId);
    const activeId    = match ? savedId : (allTimetables[0]?.id ?? null);
    State.setActiveTimetableId(activeId);

    if (activeId) {
      const tt = await API.getTimetableById(activeId);
      selected = tt.selected || [];
    }
    updateNavBadge(selected.length);
  } catch (err) {
    console.error(err);
  }
}

async function saveSelected() {
  updateNavBadge(selected.length);

  const id = State.getActiveTimetableId();
  if (!id) return true;

  try {
    await API.updateTimetable(id, { selected });
    return true;
  } catch (e) {
    console.error("updateTimetable failed:", e);
    return false;
  }
}

/* ── Timetable picker dropdown ───────────── */
function renderTtSelector() {
  const activeId = State.getActiveTimetableId();
  const active   = allTimetables.find(t => t.id === activeId);

  const label = document.getElementById("ttSelectorLabel");
  if (label) label.textContent = active?.name ?? "My Timetable";

  const items = document.getElementById("ttDropdownItems");
  if (!items) return;

  items.innerHTML = allTimetables.map(tt => `
    <button type="button" class="tt-pick-btn w-full text-left px-3 py-[7px] text-[11px] font-mono flex items-center gap-2 hover:bg-[var(--bg3)] transition-colors cursor-pointer bg-transparent border-0 text-[var(--text)]" data-id="${tt.id}">
      <span class="w-3 flex-shrink-0 text-[var(--accent)]">${tt.id === activeId ? "✓" : ""}</span>
      <span class="flex-1 min-w-0 truncate">${escHtml(tt.name)}</span>
    </button>`
  ).join("");

  items.querySelectorAll(".tt-pick-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTimetable(Number(btn.dataset.id)));
  });
}

function bindTtSelector() {
  const btn      = document.getElementById("ttSelectorBtn");
  const dropdown = document.getElementById("ttDropdown");

  btn?.addEventListener("click", e => {
    e.stopPropagation();
    dropdown?.classList.toggle("hidden");
  });

  document.getElementById("ttNewBtn")?.addEventListener("click", () => {
    dropdown?.classList.add("hidden");
    openNewTtModal();
  });

  document.addEventListener("click", e => {
    if (!document.getElementById("ttSelectorWrap")?.contains(e.target)) {
      dropdown?.classList.add("hidden");
    }
  });
}

async function switchTimetable(id) {
  document.getElementById("ttDropdown")?.classList.add("hidden");
  if (id === State.getActiveTimetableId()) return;
  State.setActiveTimetableId(id);
  try {
    const tt = await API.getTimetableById(id);
    selected  = tt.selected || [];
    updateNavBadge(selected.length);
    renderTtSelector();
    renderBasket();
    renderTable();
  } catch { toast("Could not load timetable", "error"); }
}

/* ── New timetable modal ─────────────────── */
function bindNewTtModal() {
  document.getElementById("cancelNewTtBtn")?.addEventListener("click", closeNewTtModal);
  document.getElementById("confirmNewTtBtn")?.addEventListener("click", doCreateTimetable);
  document.getElementById("newTtModal")?.addEventListener("click", e => {
    if (e.target === document.getElementById("newTtModal")) closeNewTtModal();
  });
  document.getElementById("newTtName")?.addEventListener("keydown", e => {
    if (e.key === "Enter") doCreateTimetable();
    if (e.key === "Escape") closeNewTtModal();
  });
}

function openNewTtModal() {
  const input = document.getElementById("newTtName");
  if (input) input.value = "";
  document.getElementById("newTtModal")?.classList.add("open");
  setTimeout(() => input?.focus(), 50);
}

function closeNewTtModal() {
  document.getElementById("newTtModal")?.classList.remove("open");
}

async function doCreateTimetable() {
  const name = document.getElementById("newTtName")?.value.trim();
  if (!name) { toast("Enter a timetable name", "error"); return; }
  try {
    const tt      = await API.createTimetable({ name });
    allTimetables = [tt, ...allTimetables];
    selected      = [];
    closeNewTtModal();
    State.setActiveTimetableId(tt.id);
    renderTtSelector();
    renderBasket();
    renderTable();
    updateNavBadge(0);
    toast(`"${tt.name}" created`, "success");
  } catch { toast("Could not create timetable", "error"); }
}

/* ── Filters ─────────────────────────────── */
function bindFilters() {
  document.querySelectorAll(".filter-chip[data-sem]").forEach((chip) => {
    chip.addEventListener("click", () => {
      chip.classList.toggle("on");
      activeSems = [...document.querySelectorAll(".filter-chip[data-sem].on")].map(c => c.dataset.sem);
      tablePage = 0;
      loadCourses();
    });
  });
  document.getElementById("facultyFilter")?.addEventListener("change", () => { tablePage = 0; renderTable(); });
}

function bindSearch() {
  let searchTimer;

  document.getElementById("unitSearch")?.addEventListener("input", () => {
    clearTimeout(searchTimer);

    searchTimer = setTimeout(() => {
      tablePage = 0;
      loadCourses();
    }, 300);
  });
}

function getFilteredCourses() {
  return allCourses;
}

/* ── Table ───────────────────────────────── */

function renderCourseTableSkeleton() {
  const tbody = document.getElementById("courseTableBody");
  if (!tbody) return;

  tbody.innerHTML = Array.from({ length: PAGE_SIZE }, () => `
    <tr class="skeleton-row">
      <td><div class="skeleton skeleton-code"></div></td>
      <td>
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-subtitle"></div>
      </td>
      <td><div class="skeleton skeleton-pill"></div></td>
      <td>
        <div class="flex flex-wrap gap-1">
          <div class="skeleton skeleton-tag"></div>
          <div class="skeleton skeleton-tag"></div>
        </div>
      </td>
      <td><div class="skeleton skeleton-button"></div></td>
    </tr>
  `).join("");

  const tableCount = document.getElementById("tableCount");
  if (tableCount) tableCount.textContent = "Loading units...";

  const pagination = document.getElementById("pagination");
  if (pagination) pagination.innerHTML = "";
}

function renderTable() {
  const courses = getFilteredCourses();
  const slice   = courses;
  const tbody   = document.getElementById("courseTableBody");
  if (!tbody) return;

  tbody.innerHTML = slice.length
    ? slice.map(buildTableRow).join("")
    : `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text3);font-style:italic">No units found</td></tr>`;

  tbody.querySelectorAll(".add-row-btn").forEach(btn => {
    btn.addEventListener("click", () => toggleCourse(btn.dataset.code));
  });
  tbody.querySelectorAll(".edit-custom-btn").forEach(btn => {
    btn.addEventListener("click", () => openEditModal(btn.dataset.code));
  });

  document.getElementById("tableCount").textContent =`${totalCourses} unit${totalCourses !== 1 ? "s" : ""}`;
  renderPagination(totalCourses);
}

const TYPE_TAG_CLS = {
  lec: "bg-blue-500/10 border-blue-500/30 text-blue-400",
  lab: "bg-purple-500/10 border-purple-500/30 text-purple-400",
  tut: "bg-green-500/10 border-green-500/30 text-green-400",
};
const TAG_BASE = "inline-flex items-center px-[7px] py-[2px] rounded-md text-[10px] font-mono border";

function buildTableRow(c) {
  const isAdded = selected.some(x => x.code === c.code);
  const tags    = c.sessions.map(s => {
    const cls = TYPE_TAG_CLS[s.type.toLowerCase()] || "border-[var(--border2)] text-[var(--text2)] bg-[var(--bg3)]";
    return `<span class="${TAG_BASE} ${cls}">${s.type} ${DAYS[s.day].slice(0, 3)}</span>`;
  }).join("");
  const sems = c.sems.map(s =>
    `<span class="${TAG_BASE} bg-[var(--accent-glow)] border-[var(--accent-line)] text-[var(--accent)]">${s}</span>`
  ).join("");

  return `<tr class="${isAdded ? "row-selected" : ""}">
    <td class="font-mono text-[12px] font-medium text-[var(--text)]">${c.code}</td>
    <td>
      <div class="font-medium text-[13px] text-[var(--text)]">${c.name}</div>
      <div class="text-[11px] text-[var(--text3)] mt-0.5">${c.faculty}</div>
    </td>
    <td><div class="flex flex-wrap gap-1">${sems}</div></td>
    <td><div class="flex flex-wrap gap-1">${tags}</div></td>
    <td>
      <div class="flex gap-1 items-center justify-end">
        ${c.custom ? `<button class="edit-custom-btn text-[var(--text3)] hover:text-[var(--accent)] bg-transparent border-0 cursor-pointer text-[12px] px-1" data-code="${c.code}" title="Edit unit">✏</button>` : ''}
        <button class="add-row-btn ${isAdded ? "added" : ""}" data-code="${c.code}"
          title="${isAdded ? "Remove from selection" : "Add to selection"}">
          ${isAdded ? "✓" : "+"}
        </button>
      </div>
    </td>
  </tr>`;
}

/* ── Pagination ──────────────────────────── */
function renderPagination(total) {
  const pages = Math.ceil(total / PAGE_SIZE);
  const el = document.getElementById("pagination");
  if (!el) return;

  if (pages <= 1) {
    el.innerHTML = "";
    return;
  }

  el.innerHTML = `
    <div class="pagination-controls">
      <button class="page-nav-btn" id="prevPageBtn" ${tablePage === 0 ? "disabled" : ""}>
        ← Prev
      </button>

      <span class="page-status">
        Page ${tablePage + 1} of ${pages}
      </span>

      <button class="page-nav-btn" id="nextPageBtn" ${tablePage >= pages - 1 ? "disabled" : ""}>
        Next →
      </button>
    </div>
  `;

  document.getElementById("prevPageBtn")?.addEventListener("click", async () => {
    if (tablePage === 0) return;
    tablePage -= 1;
    await loadCourses();
  });

  document.getElementById("nextPageBtn")?.addEventListener("click", async () => {
    if (tablePage >= pages - 1) return;
    tablePage += 1;
    await loadCourses();
  });
}

/* ── Toggle course in/out of selection ───── */
async function toggleCourse(code) {
  if (!State.getUser()) {
    window.location.href = "/auth";
    return;
  }

  const wasAdded = selected.some(x => x.code === code);
  const course = allCourses.find(c => c.code === code);

  if (wasAdded) {
    const previousSelected = [...selected];

    selected = selected.filter(x => x.code !== code);
    patchTableRow(code, false);
    renderBasket();
    updateNavBadge(selected.length);

    const saved = await saveSelected();

    if (!saved) {
      selected = previousSelected;
      patchTableRow(code, true);
      renderBasket();
      updateNavBadge(selected.length);
      toast(`Could not remove ${code}. Please try again.`, "error");
      return;
    }

    if (course?.custom) {
      try {
        await API.deleteCustomCourse(code);

        allCourses = allCourses.filter(c => c.code !== code);
        renderTable();
      } catch (e) {
        console.error("deleteCustomCourse failed:", e);

        selected = previousSelected;
        patchTableRow(code, true);
        renderBasket();
        updateNavBadge(selected.length);

        toast(`Could not delete ${code}. Please try again.`, "error");
        return;
      }
    }

    toast(`${code} removed`);
    return;
  }

  selected = [...selected, { code, altIdx: 0 }];
  patchTableRow(code, true);
  renderBasket();
  updateNavBadge(selected.length);

  const saved = await saveSelected();

  if (!saved) {
    selected = selected.filter(x => x.code !== code);
    patchTableRow(code, false);
    renderBasket();
    updateNavBadge(selected.length);
    toast(`Could not add ${code}. Please try again.`, "error");
    return;
  }

  toast(`${code} added`, "success");
}

function patchTableRow(code, isAdded) {
  const btn = document.querySelector(`.add-row-btn[data-code="${code}"]`);
  if (!btn) return;
  btn.closest("tr")?.classList.toggle("row-selected", isAdded);
  btn.classList.toggle("added", isAdded);
  btn.textContent = isAdded ? "✓" : "+";
  btn.title = isAdded ? "Remove from selection" : "Add to selection";
}

/* ── Basket (right sidebar) ──────────────── */
function renderBasket() {
  const body   = document.getElementById("basketBody");
  const footer = document.getElementById("basketFooter");
  if (!body) return;

  if (!selected.length) {
    body.innerHTML = '<div class="p-8 text-center text-[var(--text3)] text-[13px] italic">Add units from the table</div>';
    if (footer) footer.style.display = "none";
    return;
  }

  if (footer) footer.style.display = "";

  body.innerHTML = `<div class="divide-y divide-[var(--border)]">${selected.map(({ code }, i) => {
    const c   = allCourses.find(x => x.code === code);
    const col = getColor(i);
    const editBtn = c?.custom
      ? `<button class="w-5 h-5 rounded flex items-center justify-center border-0 bg-transparent text-[var(--text3)] text-[11px] cursor-pointer hover:text-[var(--accent)] hover:bg-[var(--accent-glow)] flex-shrink-0 edit-custom-btn" data-code="${code}" aria-label="Edit ${code}" title="Edit unit">✏</button>`
      : '';
    return `<div class="flex items-center gap-3 px-4 py-2.5">
      <div class="w-2 h-2 rounded-full flex-shrink-0" style="background:${col.border}"></div>
      <div class="flex-1 min-w-0">
        <div class="font-mono text-[11px] font-semibold text-[var(--text)]">${code}</div>
        <div class="text-[10px] text-[var(--text3)] truncate">${c ? c.name : "Custom unit"}</div>
      </div>
      ${editBtn}
      <button class="w-5 h-5 rounded flex items-center justify-center border-0 bg-transparent text-[var(--text3)] text-[14px] cursor-pointer hover:text-[var(--red)] hover:bg-[var(--red-bg)] flex-shrink-0 rm-btn" data-code="${code}" aria-label="Remove ${code}">×</button>
    </div>`;
  }).join("")}</div>`;

  body.querySelectorAll(".rm-btn").forEach(btn => {
    btn.addEventListener("click", () => toggleCourse(btn.dataset.code));
  });
  body.querySelectorAll(".edit-custom-btn").forEach(btn => {
    btn.addEventListener("click", () => openEditModal(btn.dataset.code));
  });
}

/* ── Session row helpers ─────────────────── */
function makeSessionRow(removable) {
  const row = document.createElement("div");
  row.className = "session-row flex gap-1 items-center";
  row.innerHTML = `
    <select class="sess-type sess-input">
      <option>LEC</option><option>TUT</option><option>LAB</option>
    </select>
    <select class="sess-day sess-input">
      <option value="0">Mon</option><option value="1">Tue</option>
      <option value="2">Wed</option><option value="3">Thu</option>
      <option value="4">Fri</option>
    </select>
    <input type="number" class="sess-start sess-input sess-num" min="8" max="19" value="9" title="Start hour">
    <span class="sess-sep">–</span>
    <input type="number" class="sess-end sess-input sess-num" min="9" max="20" value="11" title="End hour">
    ${removable ? '<button type="button" class="sess-rm" aria-label="Remove row">×</button>' : ''}
  `;
  if (removable) row.querySelector(".sess-rm").addEventListener("click", () => row.remove());
  return row;
}

function getSessionRows() {
  return [...document.querySelectorAll("#sessionList .session-row")].map(row => {
    const type  = row.querySelector(".sess-type").value;
    const day   = parseInt(row.querySelector(".sess-day").value);
    const start = parseInt(row.querySelector(".sess-start").value);
    const end   = parseInt(row.querySelector(".sess-end").value);
    return { type, day, hour: start, duration: Math.max(1, end - start) };
  }).filter(s => s.duration > 0);
}

function resetSessionRows() {
  const list = document.getElementById("sessionList");
  if (!list) return;
  while (list.children.length > 1) list.removeChild(list.lastChild);
  const first = list.firstElementChild;
  if (first) {
    first.querySelector(".sess-type").value  = "LEC";
    first.querySelector(".sess-day").value   = "0";
    first.querySelector(".sess-start").value = "9";
    first.querySelector(".sess-end").value   = "11";
  }
}

/* ── Manual unit add ─────────────────────── */
function bindManualAdd() {
  document.getElementById("addSessionBtn")?.addEventListener("click", () => {
    document.getElementById("sessionList")?.appendChild(makeSessionRow(true));
  });
  document.getElementById("addManualBtn")?.addEventListener("click", addManual);
  document.getElementById("manualCode")?.addEventListener("keydown", e => {
    if (e.key === "Enter") addManual();
  });
  document.querySelectorAll(".sem-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".sem-btn").forEach(b => b.classList.remove("on"));
      btn.classList.add("on");
    });
  });
}

async function addManual() {
  const codeInput = document.getElementById("manualCode");
  const nameInput = document.getElementById("manualName");
  const code      = codeInput.value.trim().toUpperCase();
  if (!code) { toast("Enter a unit code", "error"); return; }
  if (selected.some(x => x.code === code)) { toast(`${code} is already in your selection`); return; }

  const name     = nameInput?.value.trim() || code;
  const sem      = document.querySelector(".sem-btn.on")?.dataset.sem || "S1";
  const sessions = getSessionRows();

  if (!allCourses.find(c => c.code === code)) {
    const custom = { code, name, faculty: "Custom", sems: [sem], sessions, alternatives: [], custom: true };
    allCourses.push(custom);
    await API.saveCustomCourse(custom);
  }

  selected = [...selected, { code, altIdx: 0 }];
  await saveSelected();
  renderBasket();
  renderTable();
  toast(`${code} added`, "success");
  codeInput.value = "";
  if (nameInput) nameInput.value = "";
  resetSessionRows();
}

/* ── Helpers ─────────────────────────────── */
function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ── Edit custom unit modal (issue #23) ──── */
function makeEditSessionRow(removable) {
  const row = document.createElement("div");
  row.className = "session-row flex gap-1 items-center";
  row.innerHTML = `
    <select class="sess-type sess-input">
      <option>LEC</option><option>TUT</option><option>LAB</option>
    </select>
    <select class="sess-day sess-input">
      <option value="0">Mon</option><option value="1">Tue</option>
      <option value="2">Wed</option><option value="3">Thu</option>
      <option value="4">Fri</option>
    </select>
    <input type="number" class="sess-start sess-input sess-num" min="8" max="19" value="9" title="Start hour">
    <span class="sess-sep">–</span>
    <input type="number" class="sess-end sess-input sess-num" min="9" max="20" value="11" title="End hour">
    ${removable ? '<button type="button" class="sess-rm" aria-label="Remove row">×</button>' : ''}
  `;
  if (removable) row.querySelector(".sess-rm").addEventListener("click", () => row.remove());
  return row;
}

function fillEditSessionRows(sessions) {
  const list = document.getElementById("editSessionList");
  if (!list) return;
  list.innerHTML = "";
  const rows = sessions.length ? sessions : [{ type: "LEC", day: 0, hour: 9, duration: 2 }];
  rows.forEach((s, i) => {
    const row = makeEditSessionRow(i > 0);
    row.querySelector(".sess-type").value  = s.type  || "LEC";
    row.querySelector(".sess-day").value   = String(s.day   ?? 0);
    row.querySelector(".sess-start").value = String(s.hour  ?? 9);
    row.querySelector(".sess-end").value   = String((s.hour ?? 9) + (s.duration ?? 2));
    list.appendChild(row);
  });
}

function getEditSessionRows() {
  return [...document.querySelectorAll("#editSessionList .session-row")].map(row => {
    const start = parseInt(row.querySelector(".sess-start").value);
    const end   = parseInt(row.querySelector(".sess-end").value);
    return {
      type:     row.querySelector(".sess-type").value,
      day:      parseInt(row.querySelector(".sess-day").value),
      hour:     start,
      duration: Math.max(1, end - start),
    };
  }).filter(s => s.duration > 0);
}

function openEditModal(code) {
  const course = allCourses.find(c => c.code === code);
  if (!course) return;
  editingCode = code;

  const nameInput = document.getElementById("editCustomName");
  if (nameInput) nameInput.value = course.name;

  // Set semester buttons
  document.querySelectorAll("#editSemBtns .sem-btn").forEach(btn => {
    btn.classList.toggle("on", course.sems.includes(btn.dataset.sem));
  });

  fillEditSessionRows(course.sessions || []);
  document.getElementById("editCustomModal")?.classList.add("open");
  setTimeout(() => nameInput?.focus(), 50);
}

function closeEditModal() {
  editingCode = null;
  document.getElementById("editCustomModal")?.classList.remove("open");
}

async function doSaveEdit() {
  if (!editingCode) return;
  const newName = document.getElementById("editCustomName")?.value.trim();
  if (!newName) { toast("Enter a unit name", "error"); return; }

  // Client-side duplicate name check
  const dup = allCourses.find(c => c.custom && c.name === newName && c.code !== editingCode);
  if (dup) { toast(`A custom unit named "${newName}" already exists`, "error"); return; }

  const sems     = [...document.querySelectorAll("#editSemBtns .sem-btn.on")].map(b => b.dataset.sem);
  const sessions = getEditSessionRows();
  const code     = editingCode;

  try {
    const updated = await API.saveCustomCourse({ code, name: newName, sems, sessions });
    // Update in-memory course list
    const idx = allCourses.findIndex(c => c.code === code);
    if (idx !== -1) allCourses[idx] = { ...allCourses[idx], name: newName, sems, sessions };
    closeEditModal();
    renderBasket();
    renderTable();
    toast(`${code} updated`, "success");
  } catch (e) {
    toast("Could not save changes", "error");
  }
}

function bindEditModal() {
  document.getElementById("cancelEditBtn")?.addEventListener("click", closeEditModal);
  document.getElementById("confirmEditBtn")?.addEventListener("click", doSaveEdit);
  document.getElementById("editAddSessionBtn")?.addEventListener("click", () => {
    const row = makeEditSessionRow(true);
    document.getElementById("editSessionList")?.appendChild(row);
  });
  document.getElementById("editCustomModal")?.addEventListener("click", e => {
    if (e.target === document.getElementById("editCustomModal")) closeEditModal();
  });
  document.getElementById("editCustomName")?.addEventListener("keydown", e => {
    if (e.key === "Enter") doSaveEdit();
    if (e.key === "Escape") closeEditModal();
  });
  document.querySelectorAll("#editSemBtns .sem-btn").forEach(btn => {
    btn.addEventListener("click", () => btn.classList.toggle("on"));
  });
}
