import app from "./app";
import { startHeartbeatMonitor } from "./services/deviceStatus";

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  startHeartbeatMonitor();
});
