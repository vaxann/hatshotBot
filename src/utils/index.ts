import TelegramBot, {
    SendMessageOptions,
    User,
    ConstructorOptions,
    EditMessageTextOptions,
    Message
} from "node-telegram-bot-api";
import * as Db from "../database";
import async from "async"

import Log from "../log";
const log = Log(module);

import {callbackify} from "util";
import {IMessageStorage} from "../database";


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
                Db.addSessionToPlayer(data.message.chat.id, guid, callback);
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
                Db.deletePlayerSession(data.message.chat.id, callback);
            });
    });
}


export function userToText(user: User): string {
    let text = user.first_name;

    if (user.last_name)
        text += ` ${user.last_name}`;

    if (user.username)
        text += ` (@${user.username})`;
    else
        text += ` (<a href="tg://user?id=${user.id}">${user.first_name}</a>)`;

    return text;
}