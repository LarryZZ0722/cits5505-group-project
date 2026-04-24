/* ═══════════════════════════════════════════
   api.js — Data fetching layer
   
   All server communication lives here.
   To connect a real backend, replace the
   fetch() URL with your API endpoint.
   The response shape must match courses.json.
═══════════════════════════════════════════ */

const API = {
  /**
   * Fetch all available courses.
   * TODO: replace URL with real backend endpoint
   * e.g. fetch('https://your-api.com/api/courses')
   * @returns {Promise<Array>}
   */
  async getCourses() {
    const res = await fetch('./data/courses.json');
    if (!res.ok) throw new Error(`Failed to load courses (${res.status})`);
    return res.json();
  },

  /**
   * Fetch a single course by code.
   * TODO: implement when backend is ready
   * e.g. fetch(`https://your-api.com/api/courses/${code}`)
   * @param {string} code
   * @returns {Promise<Object|null>}
   */
  async getCourse(code) {
    const courses = await this.getCourses();
    return courses.find(c => c.code === code) ?? null;
  },
};

export default API;
