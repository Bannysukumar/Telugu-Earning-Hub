import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2/options";
import { defineString } from "firebase-functions/params";

const roiApiUrl = defineString("ROI_API_URL", {
  description: "HTTPS URL of deployed API, e.g. https://example.com/api/cron/process-roi",
});
const growthRoiApiUrl = defineString("GROWTH_ROI_API_URL", {
  description: "HTTPS URL for growth plan cron, e.g. https://example.com/api/cron/process-growth-roi",
});
const cronSecret = defineString("CRON_SECRET", {
  description: "Must match CRON_SECRET on the API server",
});

setGlobalOptions({ region: "asia-south1" });

async function postCron(url: string, secret: string): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cron failed (${url}): ${res.status} ${body}`);
  }
}

/**
 * Fires at 00:00 Asia/Kolkata every day. Skips are handled again server-side (weekend, inactive plans).
 */
export const distributeDailyRoi = onSchedule(
  {
    schedule: "0 0 * * *",
    timeZone: "Asia/Kolkata",
    secrets: [],
  },
  async () => {
    const url = roiApiUrl.value().trim();
    const secret = cronSecret.value().trim();
    if (!url || !secret) {
      throw new Error("Set ROI_API_URL and CRON_SECRET function params / secrets");
    }
    await postCron(url, secret);
  },
);

/** Smart Growth Plan ₹200 — daily ROI, expiry, and cap enforcement. */
export const distributeGrowthPlanRoi = onSchedule(
  {
    schedule: "5 0 * * *",
    timeZone: "Asia/Kolkata",
    secrets: [],
  },
  async () => {
    const secret = cronSecret.value().trim();
    const growthUrl = growthRoiApiUrl.value().trim();
    const legacyUrl = roiApiUrl.value().trim().replace(/\/process-roi\/?$/, "/process-growth-roi");
    const url = growthUrl || legacyUrl;
    if (!url || !secret) {
      throw new Error("Set GROWTH_ROI_API_URL (or ROI_API_URL) and CRON_SECRET");
    }
    await postCron(url, secret);
  },
);
