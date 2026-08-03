async function test() {
  const res = await fetch("https://ai-study-companion-backend.rifa-numis.workers.dev/api/auth/sign-up/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://ai-study-companion.pages.dev"
    },
    body: JSON.stringify({
      email: "testuser123@example.com",
      password: "password123",
      name: "Test User"
    })
  });
  const text = await res.text();
  console.log("STATUS:", res.status);
  console.log("RESPONSE:", text);
}
test();
