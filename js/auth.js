/* ═══════════════════════════════════════════
   auth.js — Login / Signup page
═══════════════════════════════════════════ */

import State from './utils/state.js';
import toast from './utils/toast.js';
import './utils/components.js';

document.addEventListener('DOMContentLoaded', () => {
  // If already logged in, skip straight to courses
  if (State.get().user) {
    window.location.href = 'courses.html';
    return;
  }

  bindAuthTabs();
  bindPasswordToggles();
  bindStrengthMeter();
  bindForms();
});

/* ── Tab switching ───────────────────────── */
function bindAuthTabs() {
  document.getElementById('loginTab')?.addEventListener('click',  () => switchTab('login'));
  document.getElementById('signupTab')?.addEventListener('click', () => switchTab('signup'));

  // Support ?tab=signup in URL
  const params = new URLSearchParams(location.search);
  if (params.get('tab') === 'signup') switchTab('signup');
}

function switchTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('loginTab').classList.toggle('active', isLogin);
  document.getElementById('signupTab').classList.toggle('active', !isLogin);
  document.getElementById('loginForm').style.display  = isLogin ? '' : 'none';
  document.getElementById('signupForm').style.display = isLogin ? 'none' : '';
  const footer = document.getElementById('authFooter');
  if (footer) {
    footer.innerHTML = isLogin
      ? `Don't have an account? <a data-switch-tab="signup" style="color:var(--accent);cursor:pointer">Sign up free</a>`
      : `Already have an account? <a data-switch-tab="login" style="color:var(--accent);cursor:pointer">Log in</a>`;
    footer.querySelector('[data-switch-tab]')?.addEventListener('click', e => {
      switchTab(e.target.dataset.switchTab);
    });
  }
}

/* ── Password visibility ─────────────────── */
function bindPasswordToggles() {
  document.querySelectorAll('.input-eye').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.previousElementSibling;
      input.type      = input.type === 'password' ? 'text' : 'password';
      btn.textContent = input.type === 'password' ? '👁' : '🙈';
    });
  });
}

/* ── Password strength ───────────────────── */
function bindStrengthMeter() {
  document.getElementById('signPass')?.addEventListener('input', function () {
    const pw    = this.value;
    const score = [
      pw.length >= 8,
      /[A-Z]/.test(pw),
      /[0-9]/.test(pw),
      /[^a-zA-Z0-9]/.test(pw),
    ].filter(Boolean).length;

    const fill  = document.getElementById('strengthFill');
    const label = document.getElementById('strengthLabel');

    const widths = ['0%', '25%', '50%', '75%', '100%'];
    const colors = ['', '#f76f6f', '#f5a623', '#fbbf24', '#2dd4a0'];
    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];

    fill.style.width      = widths[score];
    fill.style.background = colors[score];
    if (label) label.textContent = labels[score] || '';
  });
}

/* ── Demo accounts (frontend-only testing) ─ */
const DEMO_ACCOUNTS = [
  { name: 'Hung Nguyen',   initials: 'HN', email: '21000001@student.uwa.edu.au', studentNumber: '21000001', password: 'demo1234' },
  { name: 'Alex Smith',    initials: 'AS', email: '21234567@student.uwa.edu.au', studentNumber: '21234567', password: 'demo1234' },
  { name: 'Jordan Lee',    initials: 'JL', email: '21345678@student.uwa.edu.au', studentNumber: '21345678', password: 'demo1234' },
];

/* ── Form submission ─────────────────────── */
function bindForms() {
  document.getElementById('loginBtn')?.addEventListener('click', handleLogin);
  document.getElementById('signupBtn')?.addEventListener('click', handleSignup);
  document.getElementById('demoLoginBtn')?.addEventListener('click', handleDemoLogin);

  document.getElementById('loginPass')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('signPass')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSignup();
  });
}

function handleLogin() {
  const email    = document.getElementById('loginEmail').value.trim();
  const pass     = document.getElementById('loginPass').value;
  const emailErr = document.getElementById('loginEmailErr');

  let valid = true;
  if (!email.includes('@')) {
    emailErr.classList.remove('hidden'); valid = false;
  } else {
    emailErr.classList.add('hidden');
  }
  if (!pass) { toast('Please enter your password', 'error'); valid = false; }
  if (!valid) return;

  // Check demo accounts first
  const demo = DEMO_ACCOUNTS.find(a => a.email === email);
  if (demo && pass === demo.password) {
    loginAs(demo);
    return;
  }

  // TODO: replace with real API call  POST /api/auth/login
  const namePart     = email.split('@')[0];
  const studentMatch = namePart.match(/^(2\d{7})$/);
  const studentNumber = studentMatch ? studentMatch[1] : '20000000';
  const name         = demo?.name || namePart;
  const initials     = name[0].toUpperCase();
  State.set({ user: { name, initials, email, studentNumber } });
  toast('Welcome back! 👋', 'success');
  setTimeout(() => { window.location.href = 'courses.html'; }, 600);
}

function handleDemoLogin() {
  loginAs(DEMO_ACCOUNTS[0]);
}

function loginAs(account) {
  const { password: _, ...user } = account;
  State.set({ user });
  toast(`Logged in as ${user.name} 👋`, 'success');
  setTimeout(() => { window.location.href = 'courses.html'; }, 500);
}

function handleSignup() {
  const first    = document.getElementById('signFirst').value.trim();
  const stu      = document.getElementById('signStu').value.trim();
  const email    = document.getElementById('signEmail').value.trim();
  const pass     = document.getElementById('signPass').value;
  const agree    = document.getElementById('agreeCheck').checked;
  const stuErr   = document.getElementById('stuErr');
  const emailErr = document.getElementById('emailErr');

  let valid = true;
  if (!stu.match(/^2\d{7}$/)) { stuErr.classList.remove('hidden'); valid = false; }
  else stuErr.classList.add('hidden');

  if (!email.endsWith('@student.uwa.edu.au')) { emailErr.classList.remove('hidden'); valid = false; }
  else emailErr.classList.add('hidden');

  if (pass.length < 8) { toast('Password must be at least 8 characters', 'error'); valid = false; }
  if (!agree) { toast('Please agree to the terms of service', 'error'); valid = false; }
  if (!valid) return;

  // TODO: replace with real API call  POST /api/auth/register
  const name     = (first || 'Student').trim();
  const initials = name[0].toUpperCase();
  State.set({ user: { name, initials, email, studentNumber: stu } });
  toast('Account created! Welcome aboard 🎉', 'success');
  setTimeout(() => { window.location.href = 'courses.html'; }, 600);
}
