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
const HatSessions = sublevel(DB, 'hat_session');
const Messages = sublevel(DB, 'messages');
const Players = sublevel(DB, 'players');

export type MessageStorageAction = "send" | "edit";
export type Flow = "players-collecting" | "words-collecting" | "teams-building" | "gaming" | "scores-counting";

export interface IMessageStorage {
    action: MessageStorageAction,
    text: string,
    options?:SendMessageOptions
}

export interface Player extends User {
    words?: Array<string>,
    wonWords?: Array<string>,
    isAdmin? : boolean,
    currentMsg? : Message,
    teamId?: number|Array<number>
}

export interface Team {
    id:number,
    firstPlayerId: number,
    secondPlayerId: number,
    wonWords?: Array<string>
}

export interface Direction extends Team {
    teamId : number;
}

export interface IHatData {
    hetWelcome : string,
    players : Array<Player>,
    teams?: Array<Team>,
    directions?: Array<Direction>,
    currentMsg : Message,
    currentDirectionId?: number,
    flow : Flow,
    words?: Array<string>,
    currentWord?: string,
    timer?:number
    getNextWord?:boolean;
}

export class ExistMemberError extends Error {
    user:User;
    constructor(m: string, user:User) {
        super(m);
        this.user = user;
        Object.setPrototypeOf(this, ExistMemberError.prototype);
    }
}

export function saveSession(guid: string, data:IHatData, callback?:(err?:Error|null, data?:IHatData)=>void):void {
    HatSessions.put(guid, data, (err: Error)=>{
        if (callback) {
            if (err) return callback(err);
            callback(null, data);
        } else {
            if (err) return log.error(err);
        }
    });
}

export function loadSession(guid:string, callback:(err?:Error|null,data?:IHatData)=>void):void {
    HatSessions.get(guid, (err: Error, data:IHatData)=>{
        if (err) return callback(err);

        callback(null,data);
    });
}

export function addUserToSession(guid:string, user:User, callback:(err?:Error|null,data?:IHatData)=>void):void {
   //TODO Проверть что юзер не играет в другой игре

    loadSession(guid, (err, data)=>{
        if (err) return callback(err);
        if (!data) return callback(new Error('No Data'));

        if (_.find(data.players, (m)=>{return m.id === user.id}))
            return callback(new ExistMemberError("User already member", user));

        data.players.push(user);

        HatSessions.put(guid, data, (err: Error)=>{
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
