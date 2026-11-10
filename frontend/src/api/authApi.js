// Sign-in API. The mock below is for the demo only. It must be replaced by the real
// backend (JWT) before anyone treats this as security. The backend, not this file,
// has to decide what each role may see.
const USE_MOCK = true;
const BASE_URL = "http://localhost:5000/api";

export const ROLE_LABEL = {
  leader: "Team leader",
  outgoing: "Leaving the project",
  incoming: "Taking over",
  member: "Team member",
};

// Synthetic demo accounts. Delete these when the real backend is connected.
export const DEMO_ACCOUNTS = [
  { role: "leader", name: "Demo team leader", email: "leader@sanchaya.demo", password: "Leader@123" },
  { role: "outgoing", name: "Demo leaving member", email: "leaving@sanchaya.demo", password: "Leaving@123" },
  { role: "incoming", name: "Demo new member", email: "incoming@sanchaya.demo", password: "Incoming@123" },
  { role: "member", name: "Demo team member", email: "member@sanchaya.demo", password: "Member@123" },
];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Expected backend response: { token, name, email, role }
export async function login(email, password, role) {
  if (USE_MOCK) {
    await delay(500);
    const account = DEMO_ACCOUNTS.find(
      (a) => a.email === email.toLowerCase() && a.password === password
    );
    if (!account) throw new Error("Email or password is incorrect.");
    if (account.role !== role) {
      throw new Error(`This account does not have the “${ROLE_LABEL[role]}” role. Pick the role that matches your account.`);
    }
    return { token: "demo-token", name: account.name, email: account.email, role: account.role };
  }

  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, role }),
  });
  if (!res.ok) throw new Error("Email or password is incorrect.");
  return res.json();
}
