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
    {
      // Daily AI scoring pipeline — 06:00 JST = 21:00 UTC
      // Steps: global-market → price-sync → news → tdnet → compute-scores → rerank-top500
      name: "tohoshou-ai-daily-pipeline",
      script: "npx",
      args: "tsx scripts/daily-ai-pipeline.ts",
      cwd: "/opt/tohoshou",
      interpreter: "none",
      autorestart: false,           // one-shot; do NOT restart after each run
      cron_restart: "0 21 * * *",   // 21:00 UTC = 06:00 JST
      watch: false,
      max_memory_restart: "768M",
      env: {
        NODE_ENV: "production",
        TZ: "Asia/Tokyo",
      },
      error_file: "/opt/tohoshou/logs/ai-pipeline-error.log",
      out_file:   "/opt/tohoshou/logs/ai-pipeline-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
