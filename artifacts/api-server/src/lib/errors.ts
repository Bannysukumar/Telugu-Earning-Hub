export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Map Firebase Identity Toolkit / Firestore failures to HTTP status + safe client message. */
export function httpErrorFromUnknown(err: unknown): { status: number; error: string } {
  const msg = errorMessage(err);
  const lower = msg.toLowerCase();

  if (
    lower.includes("not authorized") ||
    lower.includes("permission_denied") ||
    lower.includes("permission denied")
  ) {
    return {
      status: 503,
      error:
        "Firestore permission denied. Ensure the service account has Cloud Datastore User (or Editor) on the GCP project and Firestore is in Native mode.",
    };
  }

  if (lower.includes("could not load the default credentials")) {
    return {
      status: 503,
      error:
        "Firebase Admin credentials missing. Set FIREBASE_SERVICE_ACCOUNT_PATH to your service account JSON (download from Firebase Console → Project settings → Service accounts).",
    };
  }

  if (lower.includes("unable to detect") && lower.includes("project id")) {
    return {
      status: 503,
      error:
        "Firebase Admin has no project ID. Set FIREBASE_SERVICE_ACCOUNT_PATH to your service account JSON (restart the API), or set FIREBASE_PROJECT_ID=telugu-earning-hub-2f74e. Without Admin working, sign-up can create an Auth user but Firestore/log-in healing will fail.",
    };
  }

  if (
    lower.includes("firestore api has not been used") ||
    lower.includes("firestore.googleapis.com") ||
    lower.includes("does not exist for project") ||
    lower.includes("does not exist") && (lower.includes("database") || lower.includes("default")) ||
    lower.includes("failed to connect") ||
    lower.includes("unavailable") ||
    lower.includes("deadline exceeded") ||
    (lower.includes("not_found") && lower.includes("database")) ||
    /\b5\s+not_found\b/i.test(msg) ||
    (lower.includes("default database") && lower.includes("not found"))
  ) {
    return {
      status: 503,
      error:
        "Firestore is not available. In Firebase Console: Build → Firestore Database → Create database (start in production or test mode). Enable billing if prompted.",
    };
  }

  if (lower.includes("cloud firestore api") && lower.includes("disabled")) {
    return {
      status: 503,
      error:
        "The Cloud Firestore API is disabled for this project. Enable it in Google Cloud Console → APIs & Services.",
    };
  }

  if (msg.includes("OPERATION_NOT_ALLOWED")) {
    return {
      status: 400,
      error:
        "Email/password sign-up is disabled. In Firebase Console: Authentication → Sign-in method → enable Email/Password.",
    };
  }

  if (msg.includes("EMAIL_EXISTS")) {
    return { status: 409, error: "Email already registered" };
  }

  if (msg.includes("WEAK_PASSWORD") || msg.includes("INVALID_PASSWORD")) {
    return { status: 400, error: "Password does not meet Firebase requirements (try a longer password)." };
  }

  if (msg.includes("INVALID_EMAIL")) {
    return { status: 400, error: "Invalid email address." };
  }

  if (msg.includes("API key") && (lower.includes("invalid") || lower.includes("blocked"))) {
    return {
      status: 503,
      error:
        "Firebase Web API key rejected. Check API key restrictions in Google Cloud Console (HTTP referrers for browser; allow server IP for API), or set FIREBASE_WEB_API_KEY.",
    };
  }

  if (lower.includes("billing") || lower.includes("quota")) {
    return { status: 503, error: msg };
  }

  if (lower.includes("firestore") || lower.includes("google.cloud.firestore")) {
    return {
      status: 503,
      error: `${msg} — Check Firestore is created in Firebase Console and the service account has access.`,
    };
  }

  return { status: 500, error: msg };
}
