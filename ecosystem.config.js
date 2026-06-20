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
  ],
};
