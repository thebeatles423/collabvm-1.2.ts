import * as toml from 'toml';
import IConfig from './IConfig.js';
import * as fs from 'fs';
import WSServer from './WSServer.js';
import QEMUVM from './QEMUVM.js';
import log from './log.js';

log("INFO", "CollabVM Server starting up");

// Add a INFO message about the experimental feature
log("INFO", "!!! You are using an experimental feature. Please be aware that this is not the final product. Experimental support for VNC and VMware is enabled.");

// Parse the config file
var Config: IConfig;

if (!fs.existsSync("config.toml")) {
    log("FATAL", "config.toml not found. Please copy config.example.toml and fill out fields");
    process.exit(1);
}

try {
    var configRaw = fs.readFileSync("config.toml").toString();
    Config = toml.parse(configRaw);
} catch (e) {
    log("FATAL", `Failed to read or parse the config file: ${e}`);
    process.exit(1);
}

async function start() {
    // Fire up the VM
    var VM = new QEMUVM(Config);
    await VM.Start();

    // Start up the WebSocket server
    var WS = new WSServer(Config, VM);
    WS.listen();
}

start();
