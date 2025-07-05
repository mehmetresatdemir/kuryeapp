const { startOrderCleanupService } = require('../services/orderCleanupService');
const { registerRoomHandlers } = require('./handlers/roomHandlers');
const registerAdminHandlers = require('./handlers/adminHandlers');
const registerOrderFlowHandlers = require('./handlers/orderFlowHandlers');

function initializeSocket(io) {
  // Start background services
  startOrderCleanupService(io);

  io.on("connection", (socket) => {
    // Register handlers for this socket connection
    registerRoomHandlers(io, socket);
    registerAdminHandlers(io, socket);
    registerOrderFlowHandlers(io, socket);

    socket.on("disconnect", () => {
      // Connection closed
    });
  });
}

module.exports = initializeSocket; 