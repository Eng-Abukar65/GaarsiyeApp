const NotificationModel = require('./models/notificationModel');

async function setupNotifications() {
  try {
    await NotificationModel.ensureSchema();
    console.log('Notifications schema is ready.');
  } catch (error) {
    console.error('Failed to prepare notifications schema:', error);
    process.exitCode = 1;
  } finally {
    process.exit();
  }
}

setupNotifications();
