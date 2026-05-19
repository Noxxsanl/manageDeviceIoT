import "./config/env"; // loads .env and validates required vars – must be first import
import app from "./app";
import { startHeartbeatMonitor } from "./services/deviceStatus";

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  startHeartbeatMonitor();
});
