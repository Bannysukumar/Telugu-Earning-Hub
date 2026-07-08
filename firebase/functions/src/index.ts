import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2/options";
import { defineString } from "firebase-functions/params";

const roiApiUrl = defineString("ROI_API_URL", {
  description: "HTTPS URL of deployed API, e.g. https://example.com/api/cron/process-roi",
});
const cronSecret = defineString("CRON_SECRET", {
  description: "Must match CRON_SECRET on the API server",
});

setGlobalOptions({ region: "asia-south1" });

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
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`ROI cron failed: ${res.status} ${body}`);
    }
  },
);
