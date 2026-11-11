import { client, setToken, setUser, clearAuth, getUser, getToken } from "./client.js";

export const ROLE_LABEL = {
  leader: "Team Leader",
  outgoing: "Outgoing Member",
  incoming: "Incoming Member",
  member: "Team Member",
  team_member: "Team Member",
};

export const DEMO_ACCOUNTS = [
  {
    role: "leader",
    name: "Demo Team Leader",
    email: "leader@sanchaya.demo",
    password: "Leader@123",
  },
  {
    role: "outgoing",
    name: "Demo Leaving Member",
    email: "leaving@sanchaya.demo",
    password: "Leaving@123",
  },
  {
    role: "incoming",
    name: "Demo New Member",
    email: "incoming@sanchaya.demo",
    password: "Incoming@123",
  },
];

function normalizeUser(result) {
  const user = result.data?.user || result.user;
  const token = result.data?.token || result.token;

  if (!user) {
    throw new Error("Invalid response received from authentication server.");
  }

  const normalized = {
    ...user,
    token,
  };

  if (token) {
    setToken(token);
  }
  setUser(normalized);

  return normalized;
}

/**
 * Log in an existing user.
 * If credentials match a demo account and it does not exist yet on the backend,
 * it auto-provisions the demo user via the respective registration endpoint.
 */
export async function login(email, password) {
  const cleanEmail = email.trim().toLowerCase();

  try {
    const result = await client.post("/auth/login", {
      email: cleanEmail,
      password,
    });
    return normalizeUser(result);
  } catch (err) {
    // If backend rejects credentials, check if it's a demo account that needs auto-provisioning
    const demoAccount = DEMO_ACCOUNTS.find(
      (a) => a.email === cleanEmail && a.password === password
    );

    if (demoAccount) {
      try {
        const registered = await register(
          demoAccount.name,
          demoAccount.email,
          demoAccount.password,
          demoAccount.role
        );
        return registered;
      } catch {
        // If registration fails because user already exists with different password, rethrow original
        throw err;
      }
    }

    throw err;
  }
}

/**
 * Register a new user with the selected role.
 * - leader -> /auth/register-as-leader
 * - outgoing -> /auth/register-as-outgoing
 * - incoming -> /auth/register
 */
export async function register(name, email, password, role = "incoming") {
  const cleanRole = role === "member" ? "incoming" : role;
  if (!["leader", "outgoing", "incoming"].includes(cleanRole)) {
    throw new Error("Role must be one of: Team Leader, Outgoing Member, or Incoming Member.");
  }

  let endpoint = "/auth/register";
  if (cleanRole === "leader") {
    endpoint = "/auth/register-as-leader";
  } else if (cleanRole === "outgoing") {
    endpoint = "/auth/register-as-outgoing";
  }

  const result = await client.post(endpoint, {
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password,
  });

  return normalizeUser(result);
}

/**
 * Verify current session using stored token or HttpOnly cookie.
 */
export async function getCurrentUser() {
  const cached = getUser();
  const token = getToken();

  try {
    const result = await client.get("/auth/me");
    const user = result.data || result.user;
    if (user) {
      const refreshed = {
        ...cached,
        ...user,
        token: token || cached?.token,
      };
      setUser(refreshed);
      return refreshed;
    }
  } catch (err) {
    // Reject revoked/expired sessions immediately; only fallback on transient network/5xx failure
    if (err?.status === 401 || err?.status === 403) {
      clearAuth();
      return null;
    }
    if (cached && token) {
      return cached;
    }
    clearAuth();
    return null;
  }

  return null;
}

export function logout() {
  clearAuth();
  return client.post("/auth/logout").catch(() => null);
}

/**
 * Request password reset token.
 * In dev/test, data.resetToken will be returned directly.
 */
export async function forgotPassword(email) {
  const cleanEmail = email.trim().toLowerCase();
  const result = await client.post("/auth/forgot-password", { email: cleanEmail });
  return result;
}

/**
 * Apply password reset using token and new password.
 */
export async function resetPassword(token, newPassword) {
  const result = await client.post("/auth/reset-password", {
    token: token.trim(),
    newPassword,
  });
  return result;
}
