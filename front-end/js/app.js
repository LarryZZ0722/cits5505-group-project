/* ═══════════════════════════════════════════
   app.js — Utility loader manifest
   
   Loads all shared utility modules in the
   correct dependency order. Every HTML page
   includes this single file before its own
   page script.

   Load order:
     1. theme.js        — applies theme before paint (no flash)
     2. state.js        — localStorage state
     3. api.js          — data fetching
     4. schedule-utils.js — pure scheduling helpers
     5. toast.js        — notification helper
     6. nav.js          — badge, user, active link, share modal
     7. <page>.js       — page-specific logic (loaded by HTML)
═══════════════════════════════════════════ */

/* These are loaded via individual <script> tags in each HTML file.
   This file exists only as documentation of the load order.
   See each HTML file's <script> block at the bottom of <body>. */
