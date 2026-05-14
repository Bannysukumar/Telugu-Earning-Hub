import admin from "firebase-admin";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./logger.js";

/** Must match your Firebase / GCP project (used if env and JSON omit it). */
const FALLBACK_PROJECT_ID = "telugu-earning-hub-2f74e";

type ServiceAccountJson = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
  type?: string;
};

function toServiceAccount(j: ServiceAccountJson): admin.ServiceAccount {
  const projectId =
    j.project_id ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    FALLBACK_PROJECT_ID;
  const clientEmail = j.client_email;
  const privateKey = j.private_key;
  if (!clientEmail || !privateKey) {
    throw new Error("Service account JSON must include client_email and private_key.");
  }
  return {
    projectId,
    clientEmail,
    privateKey,
  };
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    const n = resolve(p);
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

function tryLoadCertJson(): ServiceAccountJson | null {
  const explicit =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const here = dirname(fileURLToPath(import.meta.url));
  const cwd = process.cwd();

  const candidates = uniquePaths([
    ...(explicit ? [explicit] : []),
    // Bundled entry lives in dist/lib or src/lib → repo root is four levels up
    join(here, "../../../../telugu-earning-hub-2f74e-firebase-adminsdk-fbsvc-b79180c635.json"),
    join(here, "../../../telugu-earning-hub-2f74e-firebase-adminsdk-fbsvc-b79180c635.json"),
    join(cwd, "telugu-earning-hub-2f74e-firebase-adminsdk-fbsvc-b79180c635.json"),
    join(cwd, "..", "telugu-earning-hub-2f74e-firebase-adminsdk-fbsvc-b79180c635.json"),
    join(cwd, "..", "..", "telugu-earning-hub-2f74e-firebase-adminsdk-fbsvc-b79180c635.json"),
    join(cwd, "..", "..", "..", "telugu-earning-hub-2f74e-firebase-adminsdk-fbsvc-b79180c635.json"),
  ]);

  for (const p of candidates) {
    if (existsSync(p)) {
      const raw = JSON.parse(readFileSync(p, "utf8")) as ServiceAccountJson;
      logger.info(
        { serviceAccountPath: p, projectId: raw.project_id ?? FALLBACK_PROJECT_ID },
        "Firebase Admin using service account file",
      );
      return raw;
    }
  }
  return null;
}

if (!admin.apps.length) {
  const raw = tryLoadCertJson();
  const projectId =
    raw?.project_id ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    FALLBACK_PROJECT_ID;

  if (raw) {
    const sa = toServiceAccount(raw);
    const resolvedId = sa.projectId || projectId;
    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || `${resolvedId}.firebasestorage.app`;
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: resolvedId,
      storageBucket,
    });
  } else {
    try {
      const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId,
        storageBucket,
      });
      logger.info({ projectId, storageBucket }, "Firebase Admin using application default credentials");
    } catch (e) {
      throw new Error(
        `Firebase Admin could not initialize. Set FIREBASE_SERVICE_ACCOUNT_PATH to your Firebase service account JSON, ` +
          `or place telugu-earning-hub-2f74e-firebase-adminsdk-fbsvc-b79180c635.json at the monorepo root. ` +
          `You can also set FIREBASE_PROJECT_ID=${FALLBACK_PROJECT_ID}. Underlying error: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  const appProjectId = admin.app().options.projectId ?? projectId;
  process.env.GOOGLE_CLOUD_PROJECT ||= appProjectId;
  process.env.GCLOUD_PROJECT ||= appProjectId;
}

export { admin };
