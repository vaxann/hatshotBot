import TelegramBot, {
    SendMessageOptions,
    User,
    ConstructorOptions,
    EditMessageTextOptions,
    Message
} from "node-telegram-bot-api";
import * as Db from "../database";
import async from "async"
import _ from "lodash";

import Log from "../log";
const log = Log(module);

import {IMessageStorage, Player, Team} from "../database";


export function sendOrStore(bot:TelegramBot, chat_id:number, text:string, options?:SendMessageOptions, callback?:(err?:Error|null, msg?:Message)=>void):void {
    bot.sendMessage(chat_id, text, options)
        .then(
            (message)=>{
                log.debug("Message sent");
                if (callback) return callback(null, message);
            },
            (error)=>{
                log.debug("Error, storing message to send it later");
                Db.storeMessage(chat_id, {action:"send", text: text, options:options}, (err)=>{
                    if (callback && err) return callback(err);
                    if (callback) return callback();

                    if (err) log.error("Error can't to store message");
                });
            });
}

export function sendStored(bot:TelegramBot, chat_id:number):void {
    Db.loadStoredMessages(chat_id, (err, messages)=>{
        if (!messages) return log.debug('No stored messages');
        if (err) return log.error(err);

        async.eachSeries(messages,
            (message:IMessageStorage, callback:(err?:Error)=>void )=>{
                bot.sendMessage(chat_id, message.text, message.options)
                    .then(
                        ()=>{callback()},
                        (err)=>{callback(err)});
            },
            (err)=>{
                if (err) return log.error(err);

                Db.deleteStoredMessages(chat_id, (err)=>{
                    if (err) return log.error(err);

                    log.debug('All stored messages sent');
                });
            });


    });
}

export function storeSessionToPlayer(guid: string, callback:(err?:Error|null)=>void):void {
    Db.loadSession(guid, (err, data) => {
        if (err) return callback(err);
        if (!data) return callback(new Error("Error no Session Data"));

        async.eachSeries(data.players,
            (player, callback )=>{
                Db.addSessionToPlayer(player.id, guid, callback);
            },
            (err)=>{
                if (err) return callback(err);
                Db.addSessionToPlayer(data.currentMsg.chat.id, guid, callback);
            });
    });
}

export function removeSessionToPlayer(guid: string, callback:(err?:Error|null)=>void):void {
    Db.loadSession(guid, (err, data) => {
        if (err) return callback(err);
        if (!data) return callback(new Error("Error no Session Data"));

        async.eachSeries(data.players,
            (player, callback )=>{
                Db.deletePlayerSession(player.id, callback);
            },
            (err)=>{
                if (err) return callback(err);
                Db.deletePlayerSession(data.currentMsg.chat.id, callback);
            });
    });
}

export function playerIdToText(playerId:number, players:Array<Player>) {
    const player = _.find(players, (player)=> {return player.id === playerId});

    if (!player) throw new Error('Can\'t find player')

    return playerToText(player);
}

export function getPlayerById(playerId:number, players:Array<Player>):Player|undefined {
    return _.find(players, (player)=> {return player.id === playerId});
}

export function playerToText(player: Player): string {
    let text = player.first_name;

    if (player.last_name)
        text += ` ${player.last_name}`;

    if (player.username)
        text += ` (@${player.username})`;
    else
        text += ` (<a href="tg://user?id=${player.id}">${player.first_name}</a>)`;

    return text;
}