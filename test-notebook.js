async function test() {
  console.log("--- 1. SIGN IN ---");
  const randomEmail = `student_${Date.now()}@example.com`;
  const signUpRes = await fetch("https://ai-study-companion-backend.rifa-numis.workers.dev/api/auth/sign-up/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://ai-study-companion.pages.dev"
    },
    body: JSON.stringify({
      email: randomEmail,
      password: "Password123!",
      name: "Test Student"
    })
  });

  const signUpJson = await signUpRes.json();
  console.log("Sign-up Result:", signUpJson);
  const token = signUpJson.token;

  console.log("\n--- 2. CREATE NOTEBOOK VIA /api/notebooks ---");
  const nbRes = await fetch("https://ai-study-companion-backend.rifa-numis.workers.dev/api/notebooks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "Origin": "https://ai-study-companion.pages.dev"
    },
    body: JSON.stringify({ title: "My First Biology Notebook" })
  });

  const nbStatus = nbRes.status;
  const nbText = await nbRes.text();
  console.log("Notebook Create Status:", nbStatus);
  console.log("Notebook Create Response:", nbText);
}

test();
