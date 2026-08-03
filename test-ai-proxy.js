async function test() {
  console.log("--- STEP 1: SIGN IN TO GET TOKEN ---");
  const randomEmail = `test_${Date.now()}@example.com`;
  const signUpRes = await fetch("https://ai-study-companion-backend.rifa-numis.workers.dev/api/auth/sign-up/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://ai-study-companion.pages.dev"
    },
    body: JSON.stringify({
      email: randomEmail,
      password: "Password123!",
      name: "AI Test User"
    })
  });
  const signUpJson = await signUpRes.json();
  const token = signUpJson.token;
  console.log("Token:", token);

  console.log("\n--- STEP 2: CALL /api/ai-proxy ---");
  const proxyRes = await fetch("https://ai-study-companion-backend.rifa-numis.workers.dev/api/ai-proxy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "Origin": "https://ai-study-companion.pages.dev"
    },
    body: JSON.stringify({
      turns: [{ role: "user", content: "hello" }]
    })
  });

  console.log("Proxy Response Status:", proxyRes.status);
  console.log("Proxy Response Headers:", Object.fromEntries(proxyRes.headers.entries()));
  console.log("Proxy Response Body:", await proxyRes.text());
}

test();
