import Log from "../log";
const log = Log(module);

import TelegramBot, {
    EditMessageTextOptions,
    InlineKeyboardButton,
    Message,
    SendMessageOptions
} from "node-telegram-bot-api";
import * as Db from "../database";
import async from "async";
import {sendOrStore, userToText} from "../utils";
import _ from "lodash";

//TODO: Написать текст, о перегенрации пвр

export function showPlayersPairs(bot:TelegramBot, guid: string, isEditMsg=false): void {
    Db.loadSession(guid, (err, data) => {
        if (!data || !data.pairs) return log.error(new Error('No enough pairs'));

        async.reduce(data.pairs, {text: `3/5 Формирование команд "${data.hetWelcome}":\n`, index: 0},
            (memo, pair, callback) => {
                if (!memo) return log.error(new Error('No initial data to reduce'));
                memo.index++;
                memo.text += `${memo.index} команда:\n  - ${userToText(pair[0])}\n  - ${userToText(pair[1])}\n\n`;

                async.eachSeries(pair,
                    (player, callback) => {
                        const partner = _.find(pair, (p)=>{return p.id !== player.id});
                        if (!partner) return callback(new Error('Can\'t find partner'));

                        sendOrStore(bot, player.id, `Ваша команда ${memo.index},\nВаш партнер: ${userToText(partner)}`, {parse_mode: 'HTML'}, callback);
                    },
                    (err) => {
                        if (err) return callback(err);
                        callback(null, memo);
                    }
                );
            },
            (err, results) => {
                if (err) return log.error(err);
                if (!results || !results.text) return log.error(new Error('Cant\'t find stopPlayersCollecting text for player pairs'));

                if (isEditMsg) {
                    bot.editMessageText(results.text, __buildShowPlayersPairsOptions(data.message));
                } else {
                    const admin = _.first(data.players);
                    if (!admin) return  log.error('Can\'t find Admin');

                    bot.sendMessage(data.message.chat.id, results.text, {parse_mode: 'HTML'}).then((msg)=>{
                        data.message = msg;

                        bot.sendMessage(admin.id, __buildAdminShowPlayersPairsText(data.hetWelcome, false),
                            __buildAdminShowPlayersPairsButtons(guid, false)).then((msg)=>{
                                admin.message = msg;
                                Db.saveSession(guid,data,(err)=>{if (err) return log.error(err)});
                        });
                    });
                }
            }
        );
    });
}


export function buildPairs(bot:TelegramBot, msg: Message, isEditMsg=false): void {
    Db.loadPlayerSession(msg.chat.id, (err, guid) => {
        if (err) return log.error(err);
        if (!guid) return log.error(new Error("Can't find session"));

        Db.loadSession(guid, (err, data) => {
            if (!data || !data.players) return log.error(new Error('No enough players'));

            const random = _.shuffle(data.players);  // Перемешиваем игроков
            data.pairs = _.chunk(random, 2);  // Делим на пары

            if (random.length % 2) // если игроков нечетное число
                data.pairs[data.pairs.length - 1].push(data.pairs[data.pairs.length - 2][1]); // то дополнить последнюю пару (из одного человека) вторым человеком из пердполедней пары

            Db.saveSession(guid, data, (err) => {
                if (err) return log.error(err);

                showPlayersPairs(bot, guid, isEditMsg);
            });
        });

    });
}

function __buildAdminShowPlayersPairsButtons(guid: string, isFinished: boolean): SendMessageOptions {
    const inline_keyboard: InlineKeyboardButton[][] = [
        [{
            text: "Переформировать команды",
            callback_data: "rebuildPairs|" + guid
        }],
        [{
            text: "Начать игру!",
            callback_data: "startGame|" + guid
        }]];

    const options: SendMessageOptions = {parse_mode: 'HTML'};

    if (!isFinished)
        options.reply_markup = {inline_keyboard: inline_keyboard};

    return options;
}

function __buildShowPlayersPairsOptions(msg: Message): EditMessageTextOptions {
    const options: EditMessageTextOptions = {parse_mode: 'HTML'};

    options.chat_id = msg.chat.id;
    options.message_id = msg.message_id;

    return options;
}

function __buildAdminShowPlayersPairsText(pairingWelcome: string, isFinished: boolean): string {
    if (isFinished)
        return `Формирование конманд для игры "${pairingWelcome}" завершено`;

    return `Команды для игры "${pairingWelcome}" сформированы, можете переформировать команды или приступить к игре`;
}
