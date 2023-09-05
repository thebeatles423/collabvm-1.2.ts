import * as Utilities from './Utilities.js';
import * as guacutils from './guacutils.js';
import { WebSocket } from 'ws';
import { IPData } from './IPData.js';
import IConfig from './IConfig.js';
import RateLimiter from './RateLimiter.js';
import { execaCommand } from 'execa';

export class User {
    socket: WebSocket;
    nopSendInterval: NodeJS.Timer;
    msgReceiveInterval: NodeJS.Timer;
    nopReceiveTimeout?: NodeJS.Timer;
    username?: string;
    connectedToNode: boolean;
    viewMode: number;
    rank: Rank;
    msgsSent: number;
    Config: IConfig;
    IP: IPData;

    // Rate limiters
    ChatRateLimit: RateLimiter;
    RenameRateLimit: RateLimiter;
    LoginRateLimit: RateLimiter;
    TurnRateLimit: RateLimiter;
    VoteRateLimit: RateLimiter;

    constructor(ws: WebSocket, ip: IPData, config: IConfig, username?: string, node?: string) {
        this.IP = ip;
        this.connectedToNode = false;
        this.viewMode = -1;
        this.Config = config;
        this.socket = ws;
        this.msgsSent = 0;

        this.socket.on('close', () => this.clearIntervals());
        this.socket.on('message', () => this.handleMessage());

        this.nopSendInterval = setInterval(() => this.sendNop(), 5000);
        this.msgReceiveInterval = setInterval(() => this.onNoMsg(), 10000);

        this.sendNop();
        if (username) this.username = username;
        this.rank = Rank.Unregistered;

        this.ChatRateLimit = new RateLimiter(this.Config.collabvm.automute.messages, this.Config.collabvm.automute.seconds);
        this.ChatRateLimit.on('limit', () => this.mute(false));

        this.RenameRateLimit = new RateLimiter(3, 60);
        this.RenameRateLimit.on('limit', () => this.closeConnection());

        this.LoginRateLimit = new RateLimiter(4, 3);
        this.LoginRateLimit.on('limit', () => this.closeConnection());

        this.TurnRateLimit = new RateLimiter(5, 3);
        this.TurnRateLimit.on('limit', () => this.closeConnection());

        this.VoteRateLimit = new RateLimiter(3, 3);
        this.VoteRateLimit.on('limit', () => this.closeConnection());
    }

    private clearIntervals() {
        clearInterval(this.nopSendInterval);
        clearInterval(this.msgReceiveInterval);
    }

    private handleMessage() {
        clearTimeout(this.nopReceiveTimeout);
        clearInterval(this.msgReceiveInterval);
        this.msgReceiveInterval = setInterval(() => this.onNoMsg(), 10000);
    }

    private sendNop() {
        this.socket.send("3.nop;");
    }

    sendMsg(msg: string | Buffer) {
        if (this.socket.readyState !== this.socket.OPEN) return;
        this.clearIntervals();
        this.nopSendInterval = setInterval(() => this.sendNop(), 5000);
        this.socket.send(msg);
    }

    private onNoMsg() {
        this.sendNop();
        this.nopReceiveTimeout = setTimeout(() => this.closeConnection(), 3000);
    }

    closeConnection() {
        this.sendMsg(guacutils.encode("disconnect"));
        this.socket.close();
    }

    onMsgSent() {
        if (!this.Config.collabvm.automute.enabled || this.rank !== Rank.Unregistered) return;
        this.ChatRateLimit.request();
    }

    mute(permanent: boolean) {
        this.IP.muted = true;
        this.sendMsg(guacutils.encode("chat", "", `You have been muted${permanent ? "" : ` for ${this.Config.collabvm.tempMuteTime} seconds`}.`));
        if (!permanent) {
            clearTimeout(this.IP.tempMuteExpireTimeout);
            this.IP.tempMuteExpireTimeout = setTimeout(() => this.unmute(), this.Config.collabvm.tempMuteTime * 1000);
        }
    }

    unmute() {
        clearTimeout(this.IP.tempMuteExpireTimeout);
        this.IP.muted = false;
        this.sendMsg(guacutils.encode("chat", "", "You are no longer muted."));
    }

    async ban() {
        // Prevent the user from taking turns or chatting, in case the ban command takes a while
        this.IP.muted = true;
        //@ts-ignore
        const cmd = this.Config.collabvm.bancmd.replace(/\$IP/g, this.IP.address).replace(/\$NAME/g, this.username);
        await execaCommand(cmd);
        this.kick();
    }

    kick() {
        this.sendMsg("10.disconnect;");
        this.socket.close();
    }
}

export enum Rank {
    Unregistered = 0,
    Admin = 2,
    Moderator = 3,
    // Giving a good gap between server-only internal ranks just in case
    Turn = 10,
}
