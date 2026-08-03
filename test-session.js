async function test() {
  const randomEmail = `student_${Date.now()}@example.com`;
  console.log("--- STEP 1: SIGN UP WITH:", randomEmail);
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

  const signUpText = await signUpRes.text();
  console.log("Sign-up Status:", signUpRes.status);
  console.log("Sign-up Response:", signUpText);

  let token = "";
  try {
    const json = JSON.parse(signUpText);
    token = json.token || json.session?.token;
  } catch {}

  console.log("Extracted Token:", token);

  console.log("\n--- STEP 2: GET SESSION WITH BEARER TOKEN ---");
  const sessionRes = await fetch("https://ai-study-companion-backend.rifa-numis.workers.dev/api/auth/get-session", {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Origin": "https://ai-study-companion.pages.dev"
    }
  });

  const sessionText = await sessionRes.text();
  console.log("Session Status:", sessionRes.status);
  console.log("Session Response:", sessionText);
}

test();
