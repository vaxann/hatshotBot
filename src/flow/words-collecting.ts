import TelegramBot, {
    SendMessageOptions,
    User,
    ConstructorOptions,
    EditMessageTextOptions,
    Message, InlineKeyboardButton
} from "node-telegram-bot-api";
import _ from "lodash";
import async from "async"

import * as Db from "../database";
import {sendOrStore, userToText} from "../utils";
import Log from "../log";
import {Player} from "../database";
import {buildPairs} from "./pairs-building";
const log = Log(module);


export function startWordsCollecting(bot: TelegramBot, msg: Message) {
    Db.loadPlayerSession(msg.chat.id, (err, guid) => {
        if (err) return log.error(err);
        if (!guid) return log.error(new Error("Can't find session"));

        Db.loadSession(guid, (err, data) => {
            if (err) return log.error(err);
            if (!data) return log.error(new Error("Can't find session data"));

            data.flow = "words-collecting";

            bot.sendMessage(data.message.chat.id, __wordsCollectingWelcomeText(data.hetWelcome, data.players, false), __wordsCollectingWelcomeButton())
                .then((new_msg) => {
                    data.message = new_msg;

                    const admin = _.first(data.players);
                    if (!admin) return log.error(new Error('Can\'t find admin'));

                    sendOrStore(bot, admin.id, __buildAdminWordsCollectionText(data.hetWelcome, false),
                        __buildAdminWordsCollectionButtons(guid, false),
                        (err, m)=>{
                            if (err) return log.error(err);
                            if (!m) return log.error(new Error('Can\'t sent AdminWordsCollection'));

                            admin.message = m;
                            data.players = _.map(data.players, (p)=>{p.words = []; return p;});

                            Db.saveSession(guid, data, (err) => {
                                if (err) return log.error(err);

                                async.eachSeries(data.players, (player, callback) => {
                                    sendOrStore(bot, player.id, __wordsCollectingPlayerWelcomeText(), undefined, callback);
                                });
                            });
                    });

                });
        });
    });

}


export function restartWordsCollecting(bot: TelegramBot, msg: Message) {
    Db.loadPlayerSession(msg.chat.id, (err, guid) => {
        if (err) return log.error(err);
        if (!guid) return log.error(new Error("Can't find session"));

        Db.loadSession(guid, (err, data) => {
            if (err) return log.error(err);
            if (!data) return log.error(new Error("Can't find session data"));

            data.players = _.map(data.players, (p)=>{p.words = []; return p;});

            Db.saveSession(guid, data, (err)=>{
                if (err) return log.error(err);

                bot.editMessageText(__wordsCollectingWelcomeText(data.hetWelcome, data.players, false),
                    __wordsCollectingWelcomeButtonEdit(data.message));

                async.eachSeries(data.players, (player, callback) => {
                    sendOrStore(bot, player.id, __wordsCollectingPlayerWelcomeText(), undefined, callback);
                });
            });

        });

    });
}

export function collectWord(bot: TelegramBot, msg: Message) {
    if (!msg.from || !msg.from.id) return log.error(new Error('Error with Telegram'));

    if (msg.chat.id !== msg.from.id) return;

    Db.loadPlayerSession(msg.chat.id, (err, guid) => {
        if (err) return log.error(err);
        if (!guid) return log.error(new Error("Can't find session"));

        Db.loadSession(guid, (err, data) => {
            if (err) return log.error(err);
            if (!data) return log.error(new Error("Can't find session data"));

            if (data.flow !== "words-collecting") return;

            const player = _.find(data.players, (p) => {
                return p.id === msg.chat.id
            });

            if (player && !player.words) player.words= [];

            if (player && player.words && msg.text) {
                if (player.words.length < 5) {
                    player.words.push(msg.text);

                    if (player.words.length === 5)
                        bot.sendMessage(player.id, "Спасибо, вы ввели все 5 слов");

                    const wordsCount = _.reduce(data.players, (sum, p) => {
                        return sum + ((p.words) ? p.words.length : 0);
                    }, 0);
                    const isFinished = (wordsCount === data.players.length * 5);

                    Db.saveSession(guid, data, (err) => {
                        if (err) return log.error(err);

                        if (isFinished)
                            stopWordsCollection(bot, msg);
                        else
                            bot.editMessageText(__wordsCollectingWelcomeText(data.hetWelcome, data.players, isFinished),
                                __wordsCollectingWelcomeButtonEdit(data.message));
                    });
                }
            }
        });
    });
}

export function stopWordsCollection(bot: TelegramBot, msg: Message) {
    Db.loadPlayerSession(msg.chat.id, (err, guid) => {
        if (err) return log.error(err);
        if (!guid) return log.error(new Error("Can't find session"));

        Db.loadSession(guid, (err, data) => {
            if (err) return log.error(err);
            if (!data) return log.error(new Error("Can't find session data"));

            data.flow = "pairs-building";

            Db.saveSession(guid, data, (err) => {
                if (err) return log.error(err);

                const admin = _.first(data.players);
                if (!admin || !admin.message) return  log.error('Can\'t find Admin');

                bot.editMessageText(__buildAdminWordsCollectionText(data.hetWelcome, true),
                    __buildAdminWordsCollectionButtonsEdit(guid, admin.message, true));

                bot.editMessageText(__wordsCollectingWelcomeText(data.hetWelcome, data.players, true),
                    __wordsCollectingWelcomeButtonEdit(data.message));

                buildPairs(bot,msg);
            });
        });

    });

}

function __buildAdminWordsCollectionButtons(guid: string, isFinished: boolean): SendMessageOptions {
    const inline_keyboard: InlineKeyboardButton[][] = [
        [{
            text: "Начать заново",
            callback_data: "restartWordsCollecting|" + guid
        }],
        [{
            text: "Закончить написание",
            callback_data: "stopWordsCollecting|" + guid
        }]];

    const options: SendMessageOptions = {parse_mode: 'HTML'};

    if (!isFinished)
        options.reply_markup = {inline_keyboard: inline_keyboard};

    return options;
}

function __buildAdminWordsCollectionButtonsEdit(guid: string, msg: Message, isFinished: boolean): EditMessageTextOptions {
    const options: EditMessageTextOptions = <EditMessageTextOptions>__buildAdminWordsCollectionButtons(guid, isFinished);

    options.chat_id = msg.chat.id;
    options.message_id = msg.message_id;

    return options;
}


function __buildAdminWordsCollectionText(pairingWelcome: string, isFinished: boolean): string {
    if (isFinished)
        return `Написание слов для игры "${pairingWelcome}" завершено`;

    return `Идет написание слов "${pairingWelcome}", можете управлять процессом, как, только участники напишут по 5 слов, автоматически произойдет формировнаие команд`;
}

function __wordsCollectingWelcomeText(hetWelcome: string, players: Array<Player>, isFinished: boolean): string {
    const users = _
        .chain(players)
        .map((m) => {
            return '  - ' + userToText(m) + ' - ' + (m.words?m.words.length.toString():'0')
        })
        .join('\n')
        .value();

    const finishText = (isFinished) ? "\n\nСлова подготовлены!" : "\n\nВ приватном чате введите 5 слов...";

    return `2/5: Подготовка слов "${hetWelcome}"\n\nВсего слов написано:\n${users}${finishText}`
}

function __wordsCollectingPlayerWelcomeText(): string {
    return `В этом чате введите 5 слов, каждое отдельным сообщением:`
}


function __wordsCollectingWelcomeButtonEdit(msg:Message): EditMessageTextOptions {
    const options: EditMessageTextOptions = <EditMessageTextOptions>__wordsCollectingWelcomeButton();

    options.chat_id = msg.chat.id;
    options.message_id = msg.message_id;

    return options;
}

function __wordsCollectingWelcomeButton(): SendMessageOptions {
    const inline_keyboard: InlineKeyboardButton[][] = [[{
        text: "Перейти в приватный",
        url: "https://t.me/hatshotBot"
    }]];

    return {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: inline_keyboard
        }
    };
}