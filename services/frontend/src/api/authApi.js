
const BASE_URL = "http://localhost:5000/api";

export const ROLE_LABEL = {
  leader: "Team leader",
  outgoing: "Leaving the project",
  incoming: "incoming member",
  member: "Team member",
};

// All four demo accounts preserved
export const DEMO_ACCOUNTS = [
  {
    role: "leader",
    name: "Demo team leader",
    email: "leader@sanchaya.demo",
    password: "Leader@123",
  },
  {
    role: "outgoing",
    name: "Demo leaving member",
    email: "leaving@sanchaya.demo",
    password: "Leaving@123",
  },
  {
    role: "incoming",
    name: "Demo new member",
    email: "incoming@sanchaya.demo",
    password: "Incoming@123",
  },
  {
    role: "member",
    name: "Demo team member",
    email: "member@sanchaya.demo",
    password: "Member@123",
  },
];

const delay = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.error || result.message || "Something went wrong."
    );
  }

  return result;
}

function normalizeUser(result) {
  const user = result.data?.user;

  if (!user) {
    throw new Error("Invalid response received from server.");
  }

  return {
    ...user,
    token: result.data.token,
  };
}

// Login: demo accounts first, then real backend
// No workspace role selection required
export async function login(email, password) {
  const cleanEmail = email.trim().toLowerCase();

  // Check demo accounts
  const demoAccount = DEMO_ACCOUNTS.find(
    (account) =>
      account.email === cleanEmail &&
      account.password === password
  );

  if (demoAccount) {
    await delay(500);

    return {
      name: demoAccount.name,
      email: demoAccount.email,
      role: demoAccount.role,
      token: "demo-token",
    };
  }

  // Real backend login
  // Backend automatically returns the user's role
  const result = await apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: cleanEmail,
      password,
    }),
  });

  return normalizeUser(result);
}

// Registration: separate API for Team Leader
export async function register(
  name,
  email,
  password,
  role = "incoming"
) {
  if (!["leader", "incoming"].includes(role)) {
    throw new Error(
      "Only Team Leader and Incoming Member registration is available."
    );
  }

  const endpoint =
    role === "leader"
      ? "/auth/register-as-leader"
      : "/auth/register";

  const result = await apiRequest(endpoint, {
    method: "POST",
    body: JSON.stringify({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
    }),
  });

  return normalizeUser(result);
}
