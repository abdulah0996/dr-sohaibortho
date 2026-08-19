// Passenger loads the configured startup file as a module, so this dedicated
// entry point must launch unconditionally. Importing server.js in tests remains
// side-effect free.
const { launch } = require("./server");

launch();
