import express, { type Express } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

/** When set, serve the Vite production build from this directory on the same port as the API (avoids “Cannot GET /api/…” from a static-only server). */
const roiStaticDir = process.env.ROI_STATIC_DIR?.trim();
if (roiStaticDir) {
  const abs = path.resolve(roiStaticDir);
  if (existsSync(abs)) {
    logger.info({ roiStaticDir: abs }, "Serving web UI from ROI_STATIC_DIR (same origin as /api)");
    app.use(express.static(abs));
    app.use((req, res, next) => {
      if (req.path.startsWith("/api")) {
        next();
        return;
      }
      if (req.method !== "GET" && req.method !== "HEAD") {
        next();
        return;
      }
      const indexHtml = path.join(abs, "index.html");
      if (!existsSync(indexHtml)) {
        next();
        return;
      }
      res.sendFile(indexHtml);
    });
  } else {
    logger.warn({ roiStaticDir: abs }, "ROI_STATIC_DIR is set but directory does not exist; skipping static UI");
  }
}

export default app;
