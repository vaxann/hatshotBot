import Log from "../log";
const log = Log(module);

import TelegramBot, {Message} from "node-telegram-bot-api";
import * as Db from "../database";
import async from "async";
import {removeSessionToPlayer, sendOrStore, userToText} from "../utils";
import _ from "lodash";
import {callbackify} from "util";


export function finishingGame(bot: TelegramBot, msg: Message) {
    if (!msg.from || !msg.from.id) return log.error(new Error('Error with Telegram'));

    if (msg.chat.id === msg.from.id)
        return bot.sendMessage(msg.chat.id, "Извините, закончить игру в \"Шапку\" возможно только в групповом чате");

    Db.loadPlayerSession(msg.chat.id, (err, guid) => {
        if (err) return log.error(err);
        if (!guid) return log.error(new Error("Can't find session"));

        Db.loadSession(guid, (err, data) => {
            if (err) return log.error(err);
            if (!data) return log.error(new Error("Can't find session data"));

            removeSessionToPlayer(guid, (err)=>{
                if (err) return log.error(err);

                bot.sendMessage(msg.chat.id, `Игра "${data.hetWelcome}" окончена`);

                //TODO: Отправит персональное сообщение всем пользователям
            });
        });


    });
}