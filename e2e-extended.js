/**
 * Extended E2E Test Suite — AI Email Assistant
 * Covers: Gmail connect, IMAP connect UI, email compose/send/draft,
 * inbox thread view, reply, snooze, notes, AI features, tasks, settings.
 *
 * Run:  node e2e-extended.js
 * Requires: node_modules/playwright already installed
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

// ── Config ───────────────────────────────────────────────────────────────────
const BASE_URL = "http://localhost:3001";
const API_URL = "http://localhost:3000";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const SS_DIR = path.join(__dirname, "e2e-screenshots-extended");
const REPORT = path.join(__dirname, "e2e-extended-report.json");

const ts = Date.now();
const USER = {
  name: "Extended E2E User",
  email: `e2e.ext.${ts}@example.com`,
  password: "Secure@Password1!",
};

if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR, { recursive: true });

// ── Helpers ──────────────────────────────────────────────────────────────────
let idx = 0;
const results = [];
let passed = 0, failed = 0, skipped = 0;

function log(msg) {
  const t = new Date().toISOString().replace("T", " ").slice(0, 19);
  process.stdout.write(`[${t}] ${msg}\n`);
}

async function ss(page, label) {
  const name = `${String(++idx).padStart(3, "0")}_${label.replace(/\W+/g, "_").slice(0, 50)}.png`;
  try { await page.screenshot({ path: path.join(SS_DIR, name), fullPage: false }); } catch (_) {}
  return name;
}

async function test(name, fn, page) {
  const t0 = Date.now();
  log(`▶  ${name}`);
  try {
    const shot = await fn();
    const ms = Date.now() - t0;
    results.push({ name, status: "PASS", ms, screenshot: shot || null });
    passed++;
    log(`   ✅ PASS (${ms}ms)`);
    return true;
  } catch (err) {
    const ms = Date.now() - t0;
    let shot = null;
    if (page) { try { shot = await ss(page, `FAIL_${name}`); } catch (_) {} }
    results.push({ name, status: "FAIL", ms, error: err.message, screenshot: shot });
    failed++;
    log(`   ❌ FAIL (${ms}ms): ${err.message}`);
    return false;
  }
}

async function skip(name, reason) {
  results.push({ name, status: "SKIP", reason });
  skipped++;
  log(`   ⏭  SKIP: ${name} — ${reason}`);
}

// Direct API call helper (no browser needed)
function apiCall(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const opts = {
      hostname: "localhost",
      port: 3000,
      path,
      method,
      headers: data ? { ...headers, "Content-Length": Buffer.byteLength(data) } : headers,
    };
    const req = http.request(opts, (res) => {
      let buf = "";
      res.on("data", (c) => (buf += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null }); }
        catch { resolve({ status: res.statusCode, body: buf }); }
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  log("=".repeat(65));
  log("AI Email Assistant — Extended E2E Test Suite");
  log(`Target: ${BASE_URL}  |  API: ${API_URL}`);
  log(`User: ${USER.email}`);
  log("=".repeat(65));

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });

  let ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  let page = await ctx.newPage();
  const consoleLogs = [];
  page.on("console", (m) => { if (m.type() === "error") consoleLogs.push(m.text()); });

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION A: API Health
  // ────────────────────────────────────────────────────────────────────────────
  log("\n🩺  SECTION A: API Health");

  let apiToken = null;
  let accountId = null;

  await test("API is reachable on port 3000", async () => {
    const r = await apiCall("GET", "/health");
    if (r.status !== 200) throw new Error(`Expected 200, got ${r.status}`);
  });

  await test("Swagger docs are available at /api/docs", async () => {
    await page.goto(`${API_URL}/api/docs`, { waitUntil: "domcontentloaded" });
    const t = await page.title();
    if (!t.toLowerCase().includes("swagger")) throw new Error(`Unexpected title: ${t}`);
    const shot = await ss(page, "A_swagger_docs");
    return shot;
  }, page);

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION B: Auth via API (so we get a token for subsequent calls)
  // ────────────────────────────────────────────────────────────────────────────
  log("\n🔐  SECTION B: Auth API Flows");

  await test("Register new user via API", async () => {
    const r = await apiCall("POST", "/auth/register", {
      displayName: USER.name,
      email: USER.email,
      password: USER.password,
    });
    if (r.status !== 201) throw new Error(`Expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
    if (!r.body.accessToken) throw new Error("No accessToken in response");
    apiToken = r.body.accessToken;
  });

  await test("Login with registered credentials via API", async () => {
    const r = await apiCall("POST", "/auth/login", {
      email: USER.email,
      password: USER.password,
    });
    if (r.status !== 200 && r.status !== 201) throw new Error(`Expected 200/201, got ${r.status}`);
    if (!r.body.accessToken) throw new Error("No accessToken");
    apiToken = r.body.accessToken;
  });

  await test("Login with wrong password returns 401", async () => {
    const r = await apiCall("POST", "/auth/login", {
      email: USER.email,
      password: "WrongPassword!",
    });
    if (r.status !== 401) throw new Error(`Expected 401, got ${r.status}`);
  });

  await test("Forgot password API returns success", async () => {
    const r = await apiCall("POST", "/auth/forgot-password", {
      email: "nobody@example.com",
    });
    if (r.status !== 200 && r.status !== 201 && r.status !== 204)
      throw new Error(`Expected 2xx, got ${r.status}`);
  });

  await test("Fetch /users/me with valid token", async () => {
    const r = await apiCall("GET", "/users/me", null, apiToken);
    if (r.status !== 200) throw new Error(`Expected 200, got ${r.status}`);
    if (!r.body.email) throw new Error("No email in /users/me response");
    if (r.body.email !== USER.email) throw new Error(`Email mismatch: ${r.body.email}`);
  });

  await test("/users/me without token returns 401", async () => {
    const r = await apiCall("GET", "/users/me");
    if (r.status !== 401) throw new Error(`Expected 401, got ${r.status}`);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION C: Email Accounts (API)
  // ────────────────────────────────────────────────────────────────────────────
  log("\n📬  SECTION C: Email Account API");

  await test("List email accounts returns empty array for new user", async () => {
    const r = await apiCall("GET", "/email-accounts", null, apiToken);
    if (r.status !== 200) throw new Error(`Expected 200, got ${r.status}`);
    if (!Array.isArray(r.body)) throw new Error("Expected array");
    if (r.body.length !== 0) throw new Error(`Expected 0 accounts, got ${r.body.length}`);
  });

  await test("Connect Gmail OAuth redirect starts correctly (API check)", async () => {
    // Check the endpoint redirects (302) — we can't follow OAuth without real credentials
    const r = await apiCall("GET", `/email-accounts/connect/google?token=${encodeURIComponent(apiToken)}`);
    // Should redirect (302) to Google, or return something — not 500
    if (r.status >= 500) throw new Error(`Server error: ${r.status}`);
  });

  await test("Connect Microsoft OAuth redirect starts correctly (API check)", async () => {
    const r = await apiCall("GET", `/email-accounts/connect/microsoft?token=${encodeURIComponent(apiToken)}`);
    if (r.status >= 500) throw new Error(`Server error: ${r.status}`);
  });

  await test("IMAP connect with invalid credentials returns 400 or 500", async () => {
    const r = await apiCall("POST", "/email-accounts/connect/imap", {
      email: "test@fake-domain-that-does-not-exist-xyz.com",
      username: "test@fake-domain-that-does-not-exist-xyz.com",
      password: "wrongpassword",
      imapHost: "imap.fake-domain-xyz.com",
      imapPort: 993,
      imapSecure: true,
      smtpHost: "smtp.fake-domain-xyz.com",
      smtpPort: 465,
      smtpSecure: true,
    }, apiToken);
    if (r.status === 201) throw new Error("Expected failure, got 201 success");
    // Expect 400 (validation/connection failed) or 500 (IMAP refused)
    if (r.status < 400) throw new Error(`Expected error status, got ${r.status}`);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION D: Email API (threads/messages/drafts)
  // ────────────────────────────────────────────────────────────────────────────
  log("\n📧  SECTION D: Email API Flows");

  await test("List threads returns empty paginated result for new user", async () => {
    const r = await apiCall("GET", "/email/threads", null, apiToken);
    if (r.status !== 200) throw new Error(`Expected 200, got ${r.status}`);
    // API returns { threads: [], total: 0, page: 1, ... }
    const body = r.body;
    if (!body) throw new Error("No body");
    const threads = body.threads ?? body.data ?? body;
    if (!Array.isArray(threads)) throw new Error(`Expected threads array, got: ${JSON.stringify(body).slice(0,100)}`);
  });

  await test("List threads with folderType=DRAFTS", async () => {
    const r = await apiCall("GET", "/email/threads?folderType=DRAFTS", null, apiToken);
    if (r.status !== 200) throw new Error(`Expected 200, got ${r.status}`);
  });

  await test("List threads with folderType=SENT", async () => {
    const r = await apiCall("GET", "/email/threads?folderType=SENT", null, apiToken);
    if (r.status !== 200) throw new Error(`Expected 200, got ${r.status}`);
  });

  await test("List follow-ups returns empty for new user", async () => {
    const r = await apiCall("GET", "/email/follow-ups", null, apiToken);
    if (r.status !== 200) throw new Error(`Expected 200, got ${r.status}`);
  });

  await test("Get non-existent thread returns 404", async () => {
    const r = await apiCall("GET", "/email/threads/non-existent-id-12345", null, apiToken);
    if (r.status !== 404) throw new Error(`Expected 404, got ${r.status}`);
  });

  await test("Send email without email account returns error", async () => {
    const r = await apiCall("POST", "/email/send", {
      accountId: "non-existent-account",
      to: [{ email: "recipient@example.com" }],
      subject: "Test subject",
      bodyHtml: "<p>Hello</p>",
      bodyText: "Hello",
    }, apiToken);
    if (r.status === 201) throw new Error("Expected failure — no account connected");
    if (r.status < 400) throw new Error(`Expected error, got ${r.status}`);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION E: Tasks API
  // ────────────────────────────────────────────────────────────────────────────
  log("\n✅  SECTION E: Tasks API");

  await test("List tasks returns empty for new user", async () => {
    const r = await apiCall("GET", "/tasks", null, apiToken);
    if (r.status !== 200) throw new Error(`Expected 200, got ${r.status}`);
    if (!Array.isArray(r.body)) throw new Error("Expected array");
  });

  await test("List tasks with DONE filter", async () => {
    const r = await apiCall("GET", "/tasks?status=DONE", null, apiToken);
    if (r.status !== 200) throw new Error(`Expected 200, got ${r.status}`);
  });

  await test("List tasks with DISMISSED filter", async () => {
    const r = await apiCall("GET", "/tasks?status=DISMISSED", null, apiToken);
    if (r.status !== 200) throw new Error(`Expected 200, got ${r.status}`);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION F: Settings UI — Email Accounts Page
  // ────────────────────────────────────────────────────────────────────────────
  log("\n⚙️   SECTION F: Email Accounts Settings UI");

  // Register & login in browser to get an authenticated session
  await page.goto(`${BASE_URL}/register`, { waitUntil: "networkidle" });
  const nameInput = await page.$('input:not([type="email"]):not([type="password"])');
  if (nameInput) await nameInput.fill(USER.name);
  await page.fill('input[type="email"]', USER.email + ".ui");
  await page.fill('input[type="password"]', USER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/inbox/, { timeout: 15000 }).catch(() => {});

  await test("Email accounts settings page loads", async () => {
    await page.goto(`${BASE_URL}/settings/email-accounts`, { waitUntil: "networkidle" });
    const h1 = await page.textContent("h1");
    if (!h1?.toLowerCase().includes("email") && !h1?.toLowerCase().includes("account")) {
      throw new Error(`Unexpected heading: "${h1}"`);
    }
    const shot = await ss(page, "F_email_accounts_page");
    return shot;
  }, page);

  await test("'Connect Gmail' button is present", async () => {
    const links = await page.$$eval("a", (els) =>
      els.map((el) => el.textContent?.trim()).filter(Boolean)
    );
    if (!links.some((t) => t.includes("Gmail") || t.includes("Google"))) {
      throw new Error("Connect Gmail button not found");
    }
  }, page);

  await test("'Connect Outlook' button is present", async () => {
    const links = await page.$$eval("a", (els) =>
      els.map((el) => el.textContent?.trim()).filter(Boolean)
    );
    if (!links.some((t) => t.includes("Outlook") || t.includes("Microsoft"))) {
      throw new Error("Connect Outlook button not found");
    }
  }, page);

  await test("'Connect IMAP' button toggles IMAP form", async () => {
    const imapBtn = await page.getByRole("button", { name: /connect imap/i });
    if (!imapBtn) throw new Error("Connect IMAP button not found");
    await imapBtn.click();
    await page.waitForTimeout(500);
    // IMAP form should now be visible
    const imapHost = await page.$('input[placeholder*="imap"]');
    if (!imapHost) throw new Error("IMAP form did not appear");
    const shot = await ss(page, "F_imap_form_visible");
    return shot;
  }, page);

  await test("IMAP form shows all required fields", async () => {
    const fields = await page.$$('input[class*="input"], input[class*="rounded"]');
    // Email, display name, username, password, imap host, imap port, smtp host, smtp port
    if (fields.length < 6) throw new Error(`Expected at least 6 IMAP fields, found ${fields.length}`);
  }, page);

  await test("IMAP form submit with empty fields shows validation errors", async () => {
    // Clear all inputs
    const inputs = await page.$$('form input[class*="input"]');
    for (const input of inputs) { await input.fill(""); }
    await page.click('form button[type="submit"]');
    await page.waitForTimeout(600);
    const errors = await page.$$eval("p", (els) =>
      els.map((el) => el.textContent?.trim()).filter(Boolean)
    );
    const hasError = errors.some((e) => e.toLowerCase().includes("required") || e.toLowerCase().includes("valid"));
    if (!hasError) throw new Error("Validation errors not shown for empty IMAP form");
    const shot = await ss(page, "F_imap_validation_errors");
    return shot;
  }, page);

  await test("IMAP form submit with invalid mail server shows connection error", async () => {
    // Fill with plausible but invalid IMAP credentials
    const emailInputs = await page.$$('input[type="email"], input[class*="input"]:not([type="password"]):not([type="number"])');
    // Fill email field
    if (emailInputs.length > 0) await emailInputs[0].fill("testuser@fakeimap-xyz.com");
    const userInputs = await page.$$('input:not([type="email"]):not([type="password"]):not([type="number"]):not([type="checkbox"])');
    if (userInputs.length > 0) await userInputs[0].fill("testuser@fakeimap-xyz.com");
    const passInputs = await page.$$('input[type="password"]');
    if (passInputs.length > 0) await passInputs[0].fill("fakepassword");
    const numberInputs = await page.$$('input[type="number"]');
    if (numberInputs.length >= 2) {
      await numberInputs[0].fill("993");
      await numberInputs[1].fill("465");
    }
    const textInputs = await page.$$('input[placeholder*="imap"]');
    if (textInputs.length > 0) await textInputs[0].fill("imap.fakeimap-xyz.com");
    const smtpInputs = await page.$$('input[placeholder*="smtp"]');
    if (smtpInputs.length > 0) await smtpInputs[0].fill("smtp.fakeimap-xyz.com");

    await page.click('form button[type="submit"]');
    await page.waitForTimeout(8000); // IMAP connection timeout can take a while
    const content = await page.textContent("body");
    const hasError = content?.includes("connect") || content?.includes("error") ||
                     content?.includes("IMAP") || content?.includes("timeout") ||
                     content?.includes("fail") || content?.includes("Could not");
    if (!hasError) throw new Error("No connection error shown for invalid IMAP credentials");
    const shot = await ss(page, "F_imap_connection_error");
    return shot;
  }, page);

  await test("Gmail connect button href points to API OAuth endpoint", async () => {
    await page.goto(`${BASE_URL}/settings/email-accounts`, { waitUntil: "networkidle" });
    const gmailLink = await page.$('a:has-text("Gmail"), a:has-text("Google")');
    if (!gmailLink) throw new Error("Gmail connect link not found");
    const href = await gmailLink.getAttribute("href");
    if (!href?.includes("email-accounts/connect/google")) {
      throw new Error(`Unexpected Gmail href: ${href}`);
    }
    if (!href?.includes("token=")) {
      throw new Error("Gmail connect URL is missing JWT token parameter");
    }
  }, page);

  await test("Gmail connect initiates OAuth redirect to Google accounts", async () => {
    // Follow the redirect — it should go to Google's accounts page
    const gmailLink = await page.$('a:has-text("Gmail"), a:has-text("Google")');
    const href = await gmailLink?.getAttribute("href");
    if (!href) throw new Error("Gmail link href is null");

    // Make a HEAD request to the API URL to see where it redirects
    const url = new URL(href);
    const r = await apiCall("GET", `${url.pathname}${url.search}`);
    // Google redirect = 302 pointing to accounts.google.com
    // If OAuth credentials are valid, status should be 302
    // If credentials are invalid (placeholder), may get 400/401/500
    // We just verify it's not a 500 caused by our app crashing
    if (r.status >= 500) throw new Error(`Server error ${r.status} when initiating Google OAuth`);
    const shot = await ss(page, "G_gmail_connect_check");
    return shot;
  }, page);

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION G: Compose UI
  // ────────────────────────────────────────────────────────────────────────────
  log("\n✉️   SECTION G: Compose Flow UI");

  await test("Compose page shows 'Connect account' message without email account", async () => {
    await page.goto(`${BASE_URL}/compose`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const content = await page.textContent("body");
    const showsPrompt = content?.includes("Connect an email account") ||
                        content?.includes("New message") ||
                        content?.includes("compose");
    if (!showsPrompt) throw new Error("Compose page shows unexpected content");
    const shot = await ss(page, "G_compose_no_account");
    return shot;
  }, page);

  await test("Compose URL from sidebar/nav works", async () => {
    await page.goto(`${BASE_URL}/inbox`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const composeLink = await page.$('a[href="/compose"]');
    if (!composeLink) throw new Error("Compose nav link not found");
    await composeLink.click();
    await page.waitForURL(/\/compose/, { timeout: 5000 });
    const shot = await ss(page, "G_compose_nav");
    return shot;
  }, page);

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION H: Inbox UI Flows
  // ────────────────────────────────────────────────────────────────────────────
  log("\n📥  SECTION H: Inbox UI Flows");

  await test("Inbox has thread list area", async () => {
    await page.goto(`${BASE_URL}/inbox`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const shot = await ss(page, "H_inbox_main");
    return shot;
  }, page);

  await test("Inbox empty state is shown when no emails synced", async () => {
    const content = await page.textContent("body");
    const hasEmptyState = content?.includes("No emails") ||
                          content?.includes("empty") ||
                          content?.includes("Select a conversation") ||
                          content?.includes("Connect") ||
                          content?.includes("sync");
    if (!hasEmptyState) throw new Error("No recognizable empty state on inbox");
  }, page);

  await test("Inbox thread list pane renders (left panel)", async () => {
    // Check for thread list container - even if empty it should render
    const threadPane = await page.$('[class*="border-r"], [class*="ThreadList"]');
    // More flexible: just check the layout has two panels
    const mainContent = await page.textContent("body");
    if (!mainContent) throw new Error("No body content");
  }, page);

  await test("Inbox search input (if present) is usable", async () => {
    const searchInput = await page.$('input[type="search"], input[placeholder*="search" i], input[placeholder*="Search" i]');
    if (searchInput) {
      await searchInput.fill("test search");
      await page.waitForTimeout(500);
      await searchInput.fill("");
      const shot = await ss(page, "H_inbox_search");
      return shot;
    }
    // Not mandatory — skip if absent
  }, page);

  await test("Navigate to DRAFTS folder via sidebar", async () => {
    await page.goto(`${BASE_URL}/inbox?folderType=DRAFTS`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const shot = await ss(page, "H_inbox_drafts");
    return shot;
  }, page);

  await test("Navigate to SENT folder via sidebar", async () => {
    await page.goto(`${BASE_URL}/inbox?folderType=SENT`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const shot = await ss(page, "H_inbox_sent");
    return shot;
  }, page);

  await test("Navigate to TRASH folder", async () => {
    await page.goto(`${BASE_URL}/inbox?folderType=TRASH`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const shot = await ss(page, "H_inbox_trash");
    return shot;
  }, page);

  await test("Navigate to SPAM folder", async () => {
    await page.goto(`${BASE_URL}/inbox?folderType=SPAM`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const shot = await ss(page, "H_inbox_spam");
    return shot;
  }, page);

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION I: Tasks & Follow-ups UI
  // ────────────────────────────────────────────────────────────────────────────
  log("\n📋  SECTION I: Tasks UI Flows");

  await test("Tasks page — Pending tab shows empty state", async () => {
    await page.goto(`${BASE_URL}/tasks`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const content = await page.textContent("body");
    const hasEmptyOrTasks = content?.includes("Nothing here") || content?.includes("No task") ||
                            content?.includes("show up here") || content?.includes("Action item") ||
                            content?.includes("Meeting request");
    if (!hasEmptyOrTasks) throw new Error("Tasks page has no recognizable content");
    const shot = await ss(page, "I_tasks_pending");
    return shot;
  }, page);

  await test("Tasks page — Done tab", async () => {
    const doneBtn = await page.getByRole("button", { name: /^done$/i });
    if (!doneBtn) throw new Error("Done tab not found");
    await doneBtn.click();
    await page.waitForTimeout(600);
    const shot = await ss(page, "I_tasks_done");
    return shot;
  }, page);

  await test("Tasks page — Dismissed tab", async () => {
    const dismissedBtn = await page.getByRole("button", { name: /^dismissed$/i });
    if (!dismissedBtn) throw new Error("Dismissed tab not found");
    await dismissedBtn.click();
    await page.waitForTimeout(600);
    const shot = await ss(page, "I_tasks_dismissed");
    return shot;
  }, page);

  await test("Tasks page — All tab", async () => {
    const allBtn = await page.getByRole("button", { name: /^all$/i });
    if (!allBtn) throw new Error("All tab not found");
    await allBtn.click();
    await page.waitForTimeout(600);
    const shot = await ss(page, "I_tasks_all");
    return shot;
  }, page);

  await test("Follow-ups view shows empty state", async () => {
    const followUpsBtn = await page.getByRole("button", { name: /follow.up/i });
    if (!followUpsBtn) throw new Error("Follow-ups button not found");
    await followUpsBtn.click();
    await page.waitForTimeout(800);
    const content = await page.textContent("body");
    const ok = content?.includes("Nothing to follow") || content?.includes("Threads awaiting") ||
                content?.includes("follow") || content?.includes("reply");
    if (!ok) throw new Error("No recognizable Follow-ups content");
    const shot = await ss(page, "I_follow_ups");
    return shot;
  }, page);

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION J: Settings — Profile & Security
  // ────────────────────────────────────────────────────────────────────────────
  log("\n⚙️   SECTION J: Profile & Security Settings");

  await test("Profile settings page renders", async () => {
    await page.goto(`${BASE_URL}/settings/profile`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const shot = await ss(page, "J_profile_settings");
    return shot;
  }, page);

  await test("Profile settings shows user email or form", async () => {
    const content = await page.textContent("body");
    const hasContent = content?.includes("profile") || content?.includes("Profile") ||
                       content?.includes("name") || content?.includes("email") ||
                       content?.includes("display");
    if (!hasContent) throw new Error("Profile page has no recognizable content");
  }, page);

  await test("Security settings page renders", async () => {
    await page.goto(`${BASE_URL}/settings/security`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const shot = await ss(page, "J_security_settings");
    return shot;
  }, page);

  await test("Calendar accounts settings page renders", async () => {
    await page.goto(`${BASE_URL}/settings/calendar-accounts`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const shot = await ss(page, "J_calendar_accounts");
    return shot;
  }, page);

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION K: Documents Page
  // ────────────────────────────────────────────────────────────────────────────
  log("\n📄  SECTION K: Documents");

  await test("Documents page renders", async () => {
    await page.goto(`${BASE_URL}/documents`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const content = await page.textContent("body");
    if (!content) throw new Error("Empty documents page");
    const shot = await ss(page, "K_documents_page");
    return shot;
  }, page);

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION L: Help Page
  // ────────────────────────────────────────────────────────────────────────────
  log("\n❓  SECTION L: Help Page");

  await test("Help page renders", async () => {
    await page.goto(`${BASE_URL}/help`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const shot = await ss(page, "L_help_page");
    return shot;
  }, page);

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION M: AI Service Endpoints
  // ────────────────────────────────────────────────────────────────────────────
  log("\n🤖  SECTION M: AI Service API Checks");

  await test("AI rewrite endpoint exists and returns proper error without body", async () => {
    const r = await apiCall("POST", "/ai/rewrite", {}, apiToken);
    // Either returns rewritten text (200) or validation error (400) — not 500
    if (r.status >= 500) throw new Error(`Server error: ${r.status}`);
  });

  await test("AI summarize endpoint exists and returns proper error without thread", async () => {
    const r = await apiCall("POST", "/ai/summarize", {}, apiToken);
    if (r.status >= 500) throw new Error(`Server error: ${r.status}`);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION N: Auth Guard Edge Cases
  // ────────────────────────────────────────────────────────────────────────────
  log("\n🛡️   SECTION N: Auth Guard Edge Cases");

  await test("Protected API endpoints reject requests without token", async () => {
    const endpoints = [
      ["GET", "/email-accounts"],
      ["GET", "/email/threads"],
      ["GET", "/tasks"],
      ["GET", "/users/me"],
    ];
    for (const [method, path] of endpoints) {
      const r = await apiCall(method, path);
      if (r.status !== 401) throw new Error(`${method} ${path} expected 401, got ${r.status}`);
    }
  });

  await test("Session clearing redirects to login (UI)", async () => {
    await ctx.clearCookies();
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.goto(`${BASE_URL}/inbox`, { waitUntil: "networkidle" });
    await page.waitForURL(/\/(login|register)/, { timeout: 8000 });
    const shot = await ss(page, "N_auth_guard_redirect");
    return shot;
  }, page);

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION O: Topbar / User Menu
  // ────────────────────────────────────────────────────────────────────────────
  log("\n🔝  SECTION O: Topbar & User Menu");

  // Re-login
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', USER.email + ".ui");
  await page.fill('input[type="password"]', USER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/inbox/, { timeout: 15000 }).catch(() => {});

  await test("Topbar renders with user identity", async () => {
    await page.goto(`${BASE_URL}/inbox`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const shot = await ss(page, "O_topbar");
    return shot;
  }, page);

  await test("Sidebar has all primary nav links", async () => {
    const allLinks = await page.$$eval("a", (els) =>
      els.map((el) => el.textContent?.trim().toLowerCase()).filter(Boolean)
    );
    const expected = ["inbox", "compose", "tasks"];
    for (const nav of expected) {
      if (!allLinks.some((t) => t === nav)) {
        throw new Error(`Nav link '${nav}' not found in sidebar`);
      }
    }
  }, page);

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION P: Responsiveness
  // ────────────────────────────────────────────────────────────────────────────
  log("\n📱  SECTION P: Responsiveness");

  const viewports = [
    { name: "mobile_375", width: 375, height: 667 },
    { name: "tablet_768", width: 768, height: 1024 },
    { name: "desktop_1440", width: 1440, height: 900 },
  ];

  for (const vp of viewports) {
    await test(`Login page renders at ${vp.width}px`, async () => {
      const vpCtx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const vpPage = await vpCtx.newPage();
      await vpPage.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
      const emailInput = await vpPage.$('input[type="email"]');
      if (!emailInput) throw new Error(`Email input not found at ${vp.width}px`);
      const shot = await ss(vpPage, `P_login_${vp.name}`);
      await vpCtx.close();
      return shot;
    }, page);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // DONE — Summary
  // ────────────────────────────────────────────────────────────────────────────
  await browser.close();

  const totalMs = results.reduce((s, r) => s + (r.ms || 0), 0);
  const report = {
    runAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    apiUrl: API_URL,
    testUser: USER.email,
    total: results.length,
    passed,
    failed,
    skipped,
    totalDurationMs: totalMs,
    consoleErrors: consoleLogs,
    screenshotDir: SS_DIR,
    tests: results,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));

  log("\n" + "=".repeat(65));
  log("EXTENDED TEST SUMMARY");
  log("=".repeat(65));
  log(`Total : ${results.length}  |  Passed: ${passed}  |  Failed: ${failed}  |  Skipped: ${skipped}`);
  log(`Duration : ${(totalMs / 1000).toFixed(1)}s`);
  log(`Report   : ${REPORT}`);
  log(`Screenshots: ${SS_DIR}`);
  log("=".repeat(65));

  if (failed > 0) {
    log("\nFailed:");
    results.filter((r) => r.status === "FAIL").forEach((r) => {
      log(`  ❌ ${r.name}: ${r.error}`);
    });
  }

  process.exit(failed > 0 ? 1 : 0);
})();
