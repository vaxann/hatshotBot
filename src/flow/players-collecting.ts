import TelegramBot, {
    EditMessageTextOptions,
    InlineKeyboardButton,
    Message,
    SendMessageOptions,
    User
} from "node-telegram-bot-api";
import _ from "lodash";
import async from "async";
import {Guid} from "guid-typescript";

import * as Db from "../database";
import {sendOrStore, storeSessionToPlayer, userToText} from "../utils";
import {startWordsCollecting} from "./words-collecting";
import Log from "../log";
import {callbackify} from "util";
import {Player} from "../database";
const log = Log(module);


export function startPlayersCollection(bot: TelegramBot, msg: Message, match: RegExpExecArray|null) {
    if (!msg.from || !msg.from.id) return log.error(new Error('Error with Telegram'));
    if (!match || match.length < 2) return log.error(new Error('Error with RegExp'));

    const hetWelcome = match[1];

    if (msg.chat.id === msg.from.id)
        return bot.sendMessage(msg.chat.id, "Извините, начать игру в \"Шапку\" возможно только в групповом чате");

    Db.loadPlayerSession(msg.chat.id, (err, g)=>{
        if (!err && g) return bot.sendMessage(msg.chat.id, "Извините, в этом чате уже запущена игра, завтршите ее /unhat, прежде чем начать новую");
        if (!msg.from || !msg.from.id) return log.error(new Error('Error with Telegram'));

        const player:Player = msg.from;
        player.isAdmin = true;
        const players : Array<Player> = [player];
        const guid = Guid.create().toString();

        // send to Chat
        bot.sendMessage(msg.chat.id, __buildPlayersCollectionText(hetWelcome, players,false), __buildPlayersCollectionButtons(guid,false))
            .then((new_msg)=>{
                const data:Db.IPairingData = {hetWelcome: hetWelcome, players :players, message:new_msg, flow:"players-collecting"};

                Db.saveSession(guid, data,(err) => {
                    if (err) return log.error(err);
                    if (!msg.from || !msg.from.id) return log.error(new Error('Error with Telegram'));

                    // send to Admin
                    sendOrStore(bot, msg.from.id, __buildAdminPlayersCollectionText(hetWelcome, false), __buildAdminPlayersCollectionButtons(guid,false));

                    // send to User
                    sendOrStore(bot, msg.from.id, __buildUserPlayersCollectionText(hetWelcome));
                });
            });
    });


}

export function stopPlayersCollection(bot: TelegramBot, guid: string, msg: Message) {
    Db.loadSession(guid, (err, data) => {
        if (!data || !data.players) return log.error(new Error('No enough players'));

        async.waterfall([
            (callback:(err?:Error|null)=>void) => {
                bot.editMessageText(__buildPlayersCollectionText(data.hetWelcome, data.players, true),
                    __buildPlayersCollectionButtonsEdit(guid, data.message, true)).then(()=>{callback()}, (err)=>{callback(err)});
            },
            (callback:(err?:Error|null)=>void) => {
                bot.editMessageText(__buildAdminPlayersCollectionText(data.hetWelcome, true),
                    __buildAdminPlayersCollectionButtonsEdit(guid, msg, true)).then(()=>{callback()}, (err)=>{callback(err)});
            },
        ], (err)=>{
            if (err) return log.error(err);

            storeSessionToPlayer(guid, (err)=>{
                if (err) return log.error(err);
                startWordsCollecting(bot, msg);
            })
        });
    });
}

export function addPlayer(bot: TelegramBot, guid: string, player: Player, msg: Message) {
    if (!msg.from || !msg.from.id) return log.error(new Error('Error with Telegram'));

    Db.loadPlayerSession(msg.from.id, (err, g)=>{
        if (!msg.from || !msg.from.id) return log.error(new Error('Error with Telegram'));
        if (!err && g) return bot.sendMessage(msg.from.id, "Извините, вы уже участвуете в дргой игре, завтршите ее /unhat, прежде чем вступать в новую");

        Db.addUserToSession(guid, player, (err, data) => {
            if (err) return log.error(err);
            if (!data) return log.error("Error no Session Data");

            bot.editMessageText(__buildPlayersCollectionText(data.hetWelcome, data.players, false), __buildPlayersCollectionButtonsEdit(guid, msg, false));

            sendOrStore(bot, player.id, __buildUserPlayersCollectionText(data.hetWelcome));
        });
    });
}

function __buildPlayersCollectionButtons(guid: string, isFinished: boolean): SendMessageOptions {
    return __buildButtons(guid, isFinished);
}

function __buildPlayersCollectionButtonsEdit(guid: string, msg: Message, isFinished: boolean): EditMessageTextOptions {
    const options: EditMessageTextOptions = <EditMessageTextOptions>__buildButtons(guid, isFinished);

    options.chat_id = msg.chat.id;
    options.message_id = msg.message_id;

    return options;
}

function __buildButtons(guid: string, isFinished: boolean): SendMessageOptions {
    const inline_keyboard: InlineKeyboardButton[][] = [[{
        text: "Результаты",
        url: "https://t.me/hatshotBot"
    }]];

    if (!isFinished) {
        inline_keyboard.unshift([{
            text: "Участвую",
            callback_data: "addPlayer|" + guid
        }]);
    }

    return {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: inline_keyboard
        }
    };
}

function __buildAdminPlayersCollectionButtonsEdit(guid: string, msg: Message, isFinished: boolean): EditMessageTextOptions {
    const options: EditMessageTextOptions = <EditMessageTextOptions>__buildAdminPlayersCollectionButtons(guid, isFinished);

    options.chat_id = msg.chat.id;
    options.message_id = msg.message_id;

    return options;
}

function __buildAdminPlayersCollectionButtons(guid: string, isFinished: boolean): SendMessageOptions {
    const inline_keyboard: InlineKeyboardButton[][] = [
        [{
            text: "Зафиксировать",
            callback_data: "stopPlayersCollecting|" + guid
        }]];

    const options: SendMessageOptions = {parse_mode: 'HTML'};

    if (!isFinished)
        options.reply_markup = {inline_keyboard: inline_keyboard};

    return options;
}

function __buildResultText(pairingWelcome: string, member: User) {
    return `Результат распредления для "${pairingWelcome}", ваша пара:\n  - ${userToText(member)}`;
}

function __buildPlayersCollectionText(hetWelcome: string, players: Array<User>, isFinished: boolean): string {
    const users = _
        .chain(players)
        .map((m) => {
            return '  - ' + userToText(m)
        })
        .join('\n')
        .value();

    const finishText = (isFinished) ? "\n\nСостав участников для игры сформирован" : "\n\nПодтвердите участие?";

    return `1/5: Сбор участников "${hetWelcome}"\n\nВ игре участвуют:\n${users}${finishText}`
}



function __buildAdminPlayersCollectionText(pairingWelcome: string, isFinished: boolean): string {
    if (isFinished)
        return `Сбор участников для игры "${pairingWelcome}" завершен`;

    return `Вы создали новую игру "${pairingWelcome}", когда соберется нужное кол-во участников, зафиксируйте состав`;
}

function __buildUserPlayersCollectionText(pairingWelcome: string): string {
    return `Вы подтвердили, что участвуете в игре "${pairingWelcome}", когда все подтвердят участие, возможно будет начать написание слов`;
}