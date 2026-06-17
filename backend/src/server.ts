import "./config/env"; // loads .env and validates required vars – must be first import
import app from "./app";
import { runMigrations } from "./config/migrate";
import { startHeartbeatMonitor } from "./services/deviceStatus";
import { startMqttTracker } from "./services/mqttTracker";
import { startMqttDataService } from "./services/mqttDataService";

const PORT = process.env.PORT || 5000;

runMigrations().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    startHeartbeatMonitor();
    startMqttTracker();
    startMqttDataService();
  });
});
