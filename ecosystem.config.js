module.exports = {
  apps: [
    {
      name: "tohoshou-web",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: "/opt/tohoshou",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "768M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      error_file: "/opt/tohoshou/logs/web-error.log",
      out_file: "/opt/tohoshou/logs/web-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
    {
      name: "tohoshou-cron",
      script: "npx",
      args: "tsx scripts/cron-scheduler.ts",
      cwd: "/opt/tohoshou",
      interpreter: "none",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        TZ: "Asia/Tokyo",
      },
      error_file: "/opt/tohoshou/logs/cron-error.log",
      out_file: "/opt/tohoshou/logs/cron-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
    // ── REMOVED (P4-T1, 2026-07-05) ──────────────────────────────────────────
    // `tohoshou-ai-daily-pipeline` was a deprecated one-shot pipeline (cron_restart
    // "0 21 * * *") fully superseded by the in-process node-cron schedule in
    // scripts/cron-scheduler.ts (tohoshou-cron). Its definition is removed here to
    // prevent accidental resurrection via `pm2 start ecosystem.config.js`, which
    // would cause a double-run race (double compute-scores + rerank). The process
    // was deleted from PM2 and persisted with `pm2 save`. Do NOT re-add it —
    // all scheduling lives in tohoshou-cron. See docs/DEPLOYMENT.md.
  ],
};
