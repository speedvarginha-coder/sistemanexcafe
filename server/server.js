const { createApp } = require("./app");

const port = Number(process.env.LHM_PORT || 4780);
const server = createApp({ dataDir: process.env.LHM_DATA_DIR, port });
server.listen(port, "0.0.0.0", () => {
  console.log(`LanHouseManager: http://localhost:${port}`);
});
