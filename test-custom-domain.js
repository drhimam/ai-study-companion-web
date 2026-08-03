async function test() {
  const randomEmail = `custom_domain_${Date.now()}@example.com`;
  console.log("Testing sign-up with Origin: https://ai.qbanks.org");
  const res = await fetch("https://ai-study-companion-backend.rifa-numis.workers.dev/api/auth/sign-up/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://ai.qbanks.org"
    },
    body: JSON.stringify({
      email: randomEmail,
      password: "Password123!",
      name: "Custom Domain User"
    })
  });

  console.log("Status:", res.status);
  console.log("Response:", await res.text());
}
test();
