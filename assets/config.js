/*
 * Deployment configuration for the hosted dashboard.
 *
 * Set GATEWAY_URL to your deployed `core` gateway when the hosted service
 * actually exists. Empty means "not launched": the dashboard then shows an
 * honest state instead of pretending to create accounts.
 *
 * Self-hosters can also open app.html?gateway=http://localhost:9000, or paste
 * their gateway URL in the dashboard's advanced field. Nothing is sent
 * anywhere except to the gateway URL above. No analytics, no third parties.
 */
window.AE_CONFIG = {
  GATEWAY_URL: "",
  REPO_URL: "https://github.com/apieverything/core",
  STARTER_CREDITS: 50,
  COSTS: [
    ["Instagram / TikTok posts", 3],
    ["YouTube videos / search / transcript", 2],
    ["LinkedIn aggregate signals", 2],
    ["LinkedIn people (blocked)", 5],
    ["Profile / job / company metadata", 1],
  ],
};
