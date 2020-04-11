// @ts-ignore
const level = require('level');
// @ts-ignore
const sublevel = require('sublevel');

import _ from "lodash";

import Log from "../log";
const log = Log(module);

import Config from "../config"
import {SendMessageOptions, User, Message} from "node-telegram-bot-api";

const dbInstance:string = Config.get('dbInstance');
const DB = level(dbInstance,  { valueEncoding: 'json' });
const ParsSession = sublevel(DB, 'pars_session');
const Messages = sublevel(DB, 'messages');
const Players = sublevel(DB, 'players');

export type MessageStorageAction = "send" | "edit";
export type Flow = "players-collecting" | "words-collecting" | "pairs-building" | "gaming" | "scores-counting";

export interface IMessageStorage {
    action: MessageStorageAction,
    text: string,
    options?:SendMessageOptions
}

export interface Player extends User {
    words?: Array<string>,
    isAdmin? : boolean,
    message? : Message
}

export interface IPairingData {
    hetWelcome : string,
    players : Array<Player>,
    pairs?: Array<Array<Player>>,
    message : Message,
    flow : Flow
}

export class ExistMemberError extends Error {
    user:User;
    constructor(m: string, user:User) {
        super(m);
        this.user = user;
        Object.setPrototypeOf(this, ExistMemberError.prototype);
    }
}

export function saveSession(guid: string, data:IPairingData, callback:(err?:Error|null)=>void):void {
    ParsSession.put(guid, data, (err: Error)=>{
        if (err) return callback(err);

        callback();
    });
}

export function loadSession(guid:string, callback:(err?:Error|null,data?:IPairingData)=>void):void {
    ParsSession.get(guid, (err: Error, data:IPairingData)=>{
        if (err) return callback(err);

        callback(null,data);
    });
}

export function addUserToSession(guid:string, user:User, callback:(err?:Error|null,data?:IPairingData)=>void):void {
   //TODO Проверть что юзер не играет в другой игре

    loadSession(guid, (err, data)=>{
        if (err) return callback(err);
        if (!data) return callback(new Error('No Data'));

        if (_.find(data.players, (m)=>{return m.id === user.id}))
            return callback(new ExistMemberError("User already member", user));

        data.players.push(user);

        ParsSession.put(guid, data, (err: Error)=>{
            if (err) return callback(err);

            callback(null, data);
        });
    });
}

export function storeMessage(chat_id: number, message:IMessageStorage, callback:(err?:Error|null)=>void ):void {
    Messages.get(chat_id, (err?:Error|null, messages?: Array<IMessageStorage>)=> {
        if (err || !messages) messages = [];
        messages.push(message);
        Messages.put(chat_id, messages, callback);
    });
}

export function loadStoredMessages(chat_id: number, callback:(err?:Error|null, messages?:Array<IMessageStorage>)=>void ):void {
    Messages.get(chat_id, callback);
}

export function deleteStoredMessages(chat_id: number, callback:(err?:Error|null)=>void):void  {
    Messages.del(chat_id, callback);
}

export function addSessionToPlayer(chat_id:number, guid:string, callback:(err?:Error|null)=>void):void {
    Players.get(chat_id, (err?:Error|null, g?: string)=>{
        if (err) return Players.put(chat_id, guid, callback);
        if (g && g === guid) return callback();
        if (g && g !== guid) return callback(new Error("This user already play"));
    });
}

export function loadPlayerSession(chat_id: number, callback:(err?:Error|null, guid?:string)=>void ):void {
    Players.get(chat_id, callback);
}

export function deletePlayerSession(chat_id: number, callback:(err?:Error|null)=>void):void  {
    Players.del(chat_id, callback);
}

export function showAllPlayerSessions() {
    Players.createReadStream()
        .on('data',  (data:{key:number, value:string}) => {
            log.debug(`${data.key}=${data.value}`);
        })
        .on('error', (err?:Error|null)=>{
            if (err) log.error(err);
        })
        .on('end', function () {

        });
}
