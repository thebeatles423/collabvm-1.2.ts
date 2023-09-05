import EventEmitter from "events";
import { Socket } from "net";
import { Mutex } from "async-mutex";
import { EOL } from "os";

export default class RDPClient extends EventEmitter {
    socket: Socket;
    connected: boolean;
    sentConnected: boolean;
    cmdMutex: Mutex;

    constructor() {
        super();
        this.socket = new Socket();
        this.connected = false;
        this.sentConnected = false;
        this.cmdMutex = new Mutex();
    }

    async connect(host: string, port: number): Promise<void> {
        if (this.connected) return;
        try {
            await this.socket.connect(port, host);
        } catch (e) {
            this.onClose();
            return;
        }

        this.connected = true;
        this.socket.on('error', () => false); // Disable throwing if RDP errors
        this.socket.on('data', (data) => this.onData(data));
        this.socket.on('close', () => this.onClose());

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
                if (msg.RDP !== undefined && !this.sentConnected) {
                    this.emit('connected');
                    this.sentConnected = true;
                } else if (msg.return !== undefined && Object.keys(msg.return).length) {
                    this.emit("rdpreturn", msg.return);
                } else if (msg.event !== undefined) {
                    if (msg.event === "DISCONNECT") {
                        // Handle RDP disconnect event
                    } else if (msg.event === "RECONNECT") {
                        // Handle RDP reconnect event
                    }
                }
            } catch (error) {
                // Handle the case of invalid JSON more gracefully
                console.error(`Invalid JSON received: ${error}`);
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

    async sendMysteriousCommand() {
        if (!this.connected) return;
        await this.execute({ command: "Mysterious Purple Box" });
    }

    async execute(args: object) {
        try {
            return await this.cmdMutex.runExclusive(async () => {
                return new Promise<any>((res) => {
                    this.once('rdpreturn', (e) => res(e));
                    this.socket.write(JSON.stringify(args));
                });
            });
        } catch {
            return {};
        }
    }
}
