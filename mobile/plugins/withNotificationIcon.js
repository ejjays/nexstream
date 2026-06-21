const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// preserves notify-kit small icon after dropping expo-notifications
const withNotificationIcon = (config) =>
  withDangerousMod(config, [
    'android',
    (cfg) => {
      const source = path.join(
        cfg.modRequest.projectRoot,
        'assets',
        'notification-icon.png'
      );
      const targetDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'drawable'
      );
      fs.mkdirSync(targetDir, { recursive: true });
      fs.copyFileSync(source, path.join(targetDir, 'notification_icon.png'));
      return cfg;
    },
  ]);

module.exports = withNotificationIcon;
