const BASE_URL = "http://127.0.0.1:8000";

const emailThread = {
  subject: "Interview Tomorrow",
  thread: [
    {
      name: "John Doe",
      email: "john@example.com",
      content:
        "Hi, can we schedule an interview tomorrow at 10:00 AM? Please let me know if you're available.",
    },
  ],
};

const tests = [
  {
    name: "Reply",
    endpoint: "/email/reply",
    body: {
      ...emailThread,
      instruction: "Reply professionally and confirm availability.",
    },
  },
  {
    name: "Summarize",
    endpoint: "/email/summarize",
    body: emailThread,
  },
  {
    name: "Rewrite",
    endpoint: "/email/rewrite",
    body: {
      draft:
        "Thanks for your email. I can meet tomorrow. Looking forward to meeting you.",
      tone: "Professional",
      language: "English",
      instruction: "Make it more formal.",
    },
  },
  {
    name: "Classify",
    endpoint: "/email/classify",
    body: {
      subject: "Refund Request",
      thread: [
        {
          name: "John Doe",
          email: "john@example.com",
          content:
            "I was charged twice. Please refund my payment as soon as possible.",
        },
      ],
    },
  },
  {
    name: "Extract",
    endpoint: "/email/extract",
    body: {
      subject: "Interview Tomorrow",
      thread: [
        {
          name: "John Doe",
          email: "john@example.com",
          content:
            "Hi, can we schedule an interview tomorrow at 10:00 AM? My phone number is +91 9876543210. Company: EasyDev.",
        },
      ],
    },
  },
];

async function test({ name, endpoint, body }) {
  console.log("\n=================================================");
  console.log(`🚀 Testing ${name}`);
  console.log("=================================================");

  const start = Date.now();

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const elapsed = Date.now() - start;

    const json = await response.json();

    console.log(`Status : ${response.status}`);
    console.log(`Time   : ${elapsed} ms`);

    if (!response.ok) {
      console.error("❌ FAILED");
      console.dir(json, { depth: null });
      return false;
    }

    console.log("✅ PASSED");
    console.dir(json, { depth: null });

    return true;
  } catch (err) {
    console.error("❌ ERROR");
    console.error(err);
    return false;
  }
}

(async () => {
  console.clear();

  console.log("========================================");
  console.log("AI Email Assistant API Test");
  console.log("========================================");

  let passed = 0;

  for (const t of tests) {
    const ok = await test(t);

    if (ok) passed++;
  }

  console.log("\n========================================");
  console.log(`Passed ${passed}/${tests.length}`);
  console.log("========================================");
})();