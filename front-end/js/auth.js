/* ═══════════════════════════════════════════
   auth.js — Login / Signup page
═══════════════════════════════════════════ */

import State from "./utils/state.js";
import API from "./utils/api.js";
import toast from "./utils/toast.js";
import "./utils/components.js";

document.addEventListener("DOMContentLoaded", () => {
  // If already logged in, skip straight to courses
  if (State.getUser()) {
    window.location.href = "courses.html";
    return;
  }

  bindAuthTabs();
  bindPasswordToggles();
  bindStrengthMeter();
  bindForms();
});

/* ── Tab switching ───────────────────────── */
function bindAuthTabs() {
  document
    .getElementById("loginTab")
    ?.addEventListener("click", () => switchTab("login"));
  document
    .getElementById("signupTab")
    ?.addEventListener("click", () => switchTab("signup"));

  // Support ?tab=signup in URL
  const params = new URLSearchParams(location.search);
  if (params.get("tab") === "signup") switchTab("signup");
}

function switchTab(tab) {
  const isLogin = tab === "login";
  document.getElementById("loginTab").classList.toggle("active", isLogin);
  document.getElementById("signupTab").classList.toggle("active", !isLogin);
  document.getElementById("loginForm").style.display = isLogin ? "" : "none";
  document.getElementById("signupForm").style.display = isLogin ? "none" : "";
  const footer = document.getElementById("authFooter");
  if (footer) {
    footer.innerHTML = isLogin
      ? `Don't have an account? <a data-switch-tab="signup" style="color:var(--accent);cursor:pointer">Sign up free</a>`
      : `Already have an account? <a data-switch-tab="login" style="color:var(--accent);cursor:pointer">Log in</a>`;
    footer
      .querySelector("[data-switch-tab]")
      ?.addEventListener("click", (e) => {
        switchTab(e.target.dataset.switchTab);
      });
  }
}

/* ── Password visibility ─────────────────── */
function bindPasswordToggles() {
  document.querySelectorAll(".input-eye").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = btn.previousElementSibling;
      input.type = input.type === "password" ? "text" : "password";
      btn.textContent = input.type === "password" ? "👁" : "🙈";
    });
  });
}

/* ── Password strength ───────────────────── */
function bindStrengthMeter() {
  document.getElementById("signPass")?.addEventListener("input", function () {
    const pw = this.value;
    const score = [
      pw.length >= 8,
      /[A-Z]/.test(pw),
      /[0-9]/.test(pw),
      /[^a-zA-Z0-9]/.test(pw),
    ].filter(Boolean).length;

    const fill = document.getElementById("strengthFill");
    const label = document.getElementById("strengthLabel");

    const widths = ["0%", "25%", "50%", "75%", "100%"];
    const colors = ["", "#f76f6f", "#f5a623", "#fbbf24", "#2dd4a0"];
    const labels = ["", "Weak", "Fair", "Good", "Strong"];

    fill.style.width = widths[score];
    fill.style.background = colors[score];
    if (label) label.textContent = labels[score] || "";
  });
}

/* ── Form submission ─────────────────────── */
function bindForms() {
  document.getElementById("loginBtn")?.addEventListener("click", handleLogin);
  document.getElementById("signupBtn")?.addEventListener("click", handleSignup);

  document.getElementById("loginPass")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLogin();
  });
  document.getElementById("signPass")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSignup();
  });
}

async function handleLogin() {
  const email = document.getElementById("loginEmail").value.trim();
  const pass = document.getElementById("loginPass").value;
  const emailErr = document.getElementById("loginEmailErr");

  const isStudentId = /^\d{8}$/.test(email);
  if (!isStudentId && !email.includes("@")) {
    emailErr.classList.remove("hidden");
    return;
  }
  emailErr.classList.add("hidden");
  if (!pass) {
    toast("Please enter your password", "error");
    return;
  }

  const user = await API.login(email, pass);
  if (!user) {
    toast("Incorrect email or password", "error");
    return;
  }
  loginAs(user);
}

function loginAs(user) {
  State.setUser(user);
  toast(`Logged in as ${user.name} 👋`, "success");
  setTimeout(() => {
    window.location.href = "courses.html";
  }, 500);
}

async function handleSignup() {
  const first = document.getElementById("signFirst").value.trim();
  const stu = document.getElementById("signStu").value.trim();
  const email = document.getElementById("signEmail").value.trim();
  const pass = document.getElementById("signPass").value;
  const agree = document.getElementById("agreeCheck").checked;
  const stuErr = document.getElementById("stuErr");
  const emailErr = document.getElementById("emailErr");

  let valid = true;
  if (!/^2\d{7}$/.test(stu)) {
    stuErr.classList.remove("hidden");
    valid = false;
  } else stuErr.classList.add("hidden");
  if (!email.endsWith("@student.uwa.edu.au")) {
    emailErr.classList.remove("hidden");
    valid = false;
  } else emailErr.classList.add("hidden");
  if (pass.length < 8) {
    toast("Password must be at least 8 characters", "error");
    valid = false;
  }
  if (!agree) {
    toast("Please agree to the terms of service", "error");
    valid = false;
  }
  if (!valid) return;

  try {
    const user = await API.register({
      name: first || "Student",
      studentNumber: stu,
      email,
      password: pass,
    });
    State.setUser(user);
    toast("Account created! Welcome aboard 🎉", "success");
    setTimeout(() => {
      window.location.href = "courses.html";
    }, 600);
  } catch (err) {
    toast(err.message, "error");
  }
}
