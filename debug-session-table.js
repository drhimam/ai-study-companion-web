async function test() {
  const randomEmail = `test_${Date.now()}@example.com`;
  console.log("Signing up:", randomEmail);
  const signUpRes = await fetch("https://ai-study-companion-backend.rifa-numis.workers.dev/api/auth/sign-up/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://ai-study-companion.pages.dev"
    },
    body: JSON.stringify({
      email: randomEmail,
      password: "Password123!",
      name: "Debug User"
    })
  });
  const signUpJson = await signUpRes.json();
  console.log("SignUp token:", signUpJson.token);

  const sessionRes = await fetch("https://ai-study-companion-backend.rifa-numis.workers.dev/api/auth/get-session", {
    headers: {
      "Authorization": `Bearer ${signUpJson.token}`,
      "Origin": "https://ai-study-companion.pages.dev"
    }
  });
  console.log("get-session response:", await sessionRes.text());
}
test();
