import EventEmitter from "events";
import { Socket } from "net";
import { Mutex } from "async-mutex";
import log from "./log.js";
import { EOL } from "os";

export default class QMPClient extends EventEmitter {
    socketfile: string;
    socket: Socket;
    connected: boolean;
    sentConnected: boolean;
    cmdMutex: Mutex;

    constructor(socketfile: string) {
        super();
        this.socketfile = socketfile;
        this.socket = new Socket();
        this.connected = false;
        this.sentConnected = false;
        this.cmdMutex = new Mutex();
    }

    async connect(): Promise<void> {
        if (this.connected) return;
        try {
            await this.socket.connect(this.socketfile);
        } catch (e) {
            this.onClose();
            return;
        }

        this.connected = true;
        this.socket.on('error', () => false); // Disable throwing if QMP errors
        this.socket.on('data', (data) => this.onData(data));
        this.socket.on('close', () => this.onClose());
        await this.execute({ execute: "qmp_capabilities" });

        this.emit('connected');
        this.sentConnected = true;
    }

    disconnect() {
        this.connected = false;
        this.socket.destroy();
    }

    private onData(data: Buffer) {
        const messages = data.toString().split(EOL);
        for (const instr of messages) {
            try {
                const msg = JSON.parse(instr);
                if (msg.QMP !== undefined && !this.sentConnected) {
                    this.emit('connected');
                    this.sentConnected = true;
                } else if (msg.return !== undefined && Object.keys(msg.return).length) {
                    this.emit("qmpreturn", msg.return);
                } else if (msg.event !== undefined) {
                    if (msg.event === "STOP") {
                        log("INFO", "The VM was shut down, restarting...");
                        this.reboot();
                    } else if (msg.event === "RESET") {
                        log("INFO", "QEMU reset event occurred");
                        this.resume();
                    }
                }
            } catch (error) {
                // Handle the case of invalid JSON more gracefully
                log("ERROR", `Invalid JSON received: ${error}`);
            }
        }
    }

    private onClose() {
        this.connected = false;
        this.sentConnected = false;
        if (this.socket.readyState === 'open') {
            this.socket.destroy();
        }
        this.cmdMutex.cancel();
        this.cmdMutex.release();
        this.socket = new Socket();
        this.emit('close');
    }

    async reboot() {
        if (!this.connected) return;
        await this.execute({"execute": "system_reset"});
    }

    async resume() {
        if (!this.connected) return;
        await this.execute({"execute": "cont"});
    }

    async ExitQEMU() {
        if (!this connected) return;
        await this.execute({"execute": "quit"});
    }

    async execute(args: object) {
        try {
            return await this.cmdMutex.runExclusive(async () => {
                return new Promise<any>((res) => {
                    this.once('qmpreturn', (e) => res(e));
                    this.socket.write(JSON.stringify(args));
                });
            });
        } catch {
            return {};
        }
    }

    async runMonitorCmd(command: string) {
        return await this.execute({execute: "human-monitor-command", arguments: {"command-line": command}});
    }
}
