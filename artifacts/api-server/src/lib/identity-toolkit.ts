const FIREBASE_WEB_API_KEY =
  process.env.FIREBASE_WEB_API_KEY ?? "AIzaSyCDMrNtJnTgtnkRYfJQItZ3cj8ATsNk9FE";

export type IdentitySuccess = {
  idToken: string;
  localId: string;
  email: string;
};

export async function identitySignUp(email: string, password: string): Promise<IdentitySuccess> {
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_WEB_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const j = (await r.json()) as { error?: { message: string }; idToken?: string; localId?: string; email?: string };
  if (!r.ok) {
    const msg = j.error?.message ?? "signUp failed";
    const err = new Error(msg) as Error & { code?: string };
    if (msg.includes("EMAIL_EXISTS")) err.code = "EMAIL_EXISTS";
    throw err;
  }
  return { idToken: j.idToken!, localId: j.localId!, email: j.email! };
}

export async function identitySignIn(email: string, password: string): Promise<IdentitySuccess> {
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const j = (await r.json()) as { error?: { message: string }; idToken?: string; localId?: string; email?: string };
  if (!r.ok) {
    throw new Error(j.error?.message ?? "signIn failed");
  }
  return { idToken: j.idToken!, localId: j.localId!, email: j.email! };
}

export async function identityChangePassword(idToken: string, newPassword: string): Promise<IdentitySuccess> {
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${FIREBASE_WEB_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, password: newPassword, returnSecureToken: true }),
    },
  );
  const j = (await r.json()) as { error?: { message: string }; idToken?: string; localId?: string; email?: string };
  if (!r.ok) {
    throw new Error(j.error?.message ?? "password update failed");
  }
  return { idToken: j.idToken!, localId: j.localId!, email: j.email! };
}
