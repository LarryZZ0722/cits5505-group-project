/* ═══════════════════════════════════════════
   profile.js — Profile page
═══════════════════════════════════════════ */

import State from './utils/state.js';
import API   from './utils/api.js';
import toast from './utils/toast.js';
import './utils/components.js';

document.addEventListener('DOMContentLoaded', async () => {
  const user = State.getUser();
  if (!user) { window.location.href = 'auth.html'; return; }

  populateBanner(user);
  populateForm(user);
  bindPasswordToggles();
  bindStrengthMeter();
  bindSaveProfile();
  bindChangePassword();
});

/* ── Banner ──────────────────────────────── */
function populateBanner(user) {
  document.getElementById('profileAvatar').textContent = user.initials || '?';
  document.getElementById('profileName').textContent   = user.name    || '—';
  document.getElementById('profileEmail').textContent  = user.email   || '—';
}

/* ── Pre-fill form fields ────────────────── */
function populateForm(user) {
  document.getElementById('profileNameInput').value = user.name          || '';
  document.getElementById('profileStuInput').value  = user.studentNumber || '';
}

/* ── Save personal info ──────────────────── */
function bindSaveProfile() {
  document.getElementById('saveProfileBtn')?.addEventListener('click', async () => {
    const name = document.getElementById('profileNameInput').value.trim();
    const sn   = document.getElementById('profileStuInput').value.trim();
    const err  = document.getElementById('profileStuErr');

    if (!/^2\d{7}$/.test(sn)) {
      err.classList.remove('hidden');
      return;
    }
    err.classList.add('hidden');

    try {
      const updated = await API.updateProfile({ name: name || State.getUser().name, studentNumber: sn });
      State.setUser(updated);
      populateBanner(updated);
      toast('Profile updated', 'success');
    } catch (e) {
      toast(e.message || 'Could not update profile', 'error');
    }
  });
}

/* ── Change password ─────────────────────── */
function bindChangePassword() {
  document.getElementById('changePassBtn')?.addEventListener('click', async () => {
    const current  = document.getElementById('currentPass').value;
    const next     = document.getElementById('newPass').value;
    const confirm  = document.getElementById('confirmPass').value;
    const matchErr = document.getElementById('confirmErr');

    if (next !== confirm) {
      matchErr.classList.remove('hidden');
      return;
    }
    matchErr.classList.add('hidden');

    if (next.length < 8) {
      toast('New password must be at least 8 characters', 'error');
      return;
    }

    try {
      await API.changePassword({ currentPassword: current, newPassword: next });
      toast('Password updated', 'success');
      document.getElementById('currentPass').value = '';
      document.getElementById('newPass').value     = '';
      document.getElementById('confirmPass').value = '';
      document.getElementById('strengthFill').style.width = '0';
      document.getElementById('strengthLabel').textContent = '';
    } catch (e) {
      toast(e.message || 'Could not update password', 'error');
    }
  });
}

/* ── Password visibility toggles ────────── */
function bindPasswordToggles() {
  document.querySelectorAll('.input-eye').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      input.type      = input.type === 'password' ? 'text' : 'password';
      btn.textContent = input.type === 'password' ? '👁' : '🙈';
    });
  });
}

/* ── Password strength meter ─────────────── */
function bindStrengthMeter() {
  document.getElementById('newPass')?.addEventListener('input', function () {
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
