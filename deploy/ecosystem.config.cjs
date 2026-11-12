const path = require('node:path');
const fs = require('node:fs');

const cwd = path.resolve(__dirname, '..');
const marker = path.join(cwd, '.deploy-sha');
const commit = process.env.ALAMINO_DEPLOY_SHA || (fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').trim() : 'unmanaged');

module.exports = {
  apps: [{
    name: 'alamino',
    cwd,
    script: path.join(cwd, 'node_modules/next/dist/bin/next'),
    interpreter: '/home/debian/.nvm/versions/node/v24.21.0/bin/node',
    args: ['start', '--hostname', '127.0.0.1', '--port', '3100'],
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    kill_timeout: 15000,
    out_file: '/home/debian/alamino/.deploy/logs/alamino-out.log',
    error_file: '/home/debian/alamino/.deploy/logs/alamino-error.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
    env: {
      NODE_ENV: 'production',
      DATABASE_PATH: '/home/debian/alamino/data/app.db',
      DEPLOY_SHA: commit,
    },
  }],
};
