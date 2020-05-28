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
import {playerIdToText, getPlayerById} from "../utils";
import _ from "lodash";
import {Direction, IHatData, Player} from "../database";
import {scoresCounting} from "./scores-counting";

export function selectPlayer(bot:TelegramBot, msg: Message, isFirstSelection:boolean = false) {
    Db.loadPlayerSession(msg.chat.id, (err, guid) => {
        if (err) return log.error(err);
        if (!guid) return log.error(new Error("Can't find session"));

        Db.loadSession(guid, (err, data) => {
            if (!data || !data.players) return log.error(new Error('No enough players'));
            if (data.flow !== 'gaming') return log.error(new Error('Game isn\'t start'));

            if (!data.words)
                return bot.sendMessage(data.currentMsg.chat.id, "Больше нет слов для игры");

            if(!data.directions) {
                data.directions = _
                    .chain(data.teams)
                    .reduce((directions, team)=>{
                        directions.push(<Direction>{
                            id:directions.length,
                            firstPlayerId:team.firstPlayerId,
                            secondPlayerId: team.secondPlayerId,
                            teamId: team.id
                        });
                        directions.push(<Direction>{
                            id:directions.length,
                            firstPlayerId:team.secondPlayerId,
                            secondPlayerId: team.firstPlayerId,
                            teamId: team.id
                        });
                        return directions;
                    }, <Array<Direction>>[])
                    .shuffle() // Перемешиваем направленя игры
                    .value();

                data.currentDirectionId = -1;
            }

            data.currentDirectionId = ((data.currentDirectionId||0)+1 === data.directions.length)?0:(data.currentDirectionId||0)+1;

            const direction = data.directions[data.currentDirectionId];

            async.parallel([
                (callback: (err?:Error)=>void)=>{
                    bot.sendMessage(direction.firstPlayerId,
                        __buildPlayerStartGameText(direction.secondPlayerId, data.players),
                        __buildPlayerStartGameButtons(guid)).then((msg)=>{
                            const player = getPlayerById(direction.firstPlayerId, data.players);
                            if (!player) return callback(new Error('Can\'t find player'));
                            player.currentMsg = msg;
                            callback();
                        });
                },
                (callback: (err?:Error)=>void)=>{
                    if (isFirstSelection) {
                        bot.sendMessage(data.currentMsg.chat.id,
                            __buildAllDirectionsText(data.hetWelcome, data.timer, data.words||[], direction, data.directions||[], data.players),
                            {parse_mode: 'HTML'}).then((msg)=>{
                            data.currentMsg = msg;
                            callback();
                        });
                    } else {
                        bot.editMessageText(__buildAllDirectionsText(data.hetWelcome, data.timer,data.words||[], direction, data.directions||[], data.players),
                            __buildAllDirectionsOptions(data.currentMsg)).then(()=>{callback()});
                    }
                }
            ], (err) =>{
                if (err) return log.error(err);
                Db.saveSession(guid, data);
            });
        });

    });
}


export function getWord(bot:TelegramBot, msg: Message) {
    Db.loadPlayerSession(msg.chat.id, (err, guid) => {
        if (err) return log.error(err);
        if (!guid) return log.error(new Error("Can't find session"));

        Db.loadSession(guid, (err, data) => {
            if (!data || !data.players) return log.error(new Error('No enough players'));
            if (data.flow !== 'gaming') return log.error(new Error('Game isn\'t start'));

            // если нажали на конопу, отправить сообщение, что нужно взять новое слово
            if (data.words && data.timer && data.currentWord) {
                data.getNextWord = true;
                return Db.saveSession(guid, data);
            }

            async.doUntil(
                (callback:(err?:Error|null,data?:IHatData)=>void)=>{
                    Db.loadSession(guid, (err, data) => {
                        if (!data || !data.players) return callback(new Error('No enough players'));
                        if (data.flow !== 'gaming') return callback(new Error('Game isn\'t start'));

                        if (!data.directions || data.currentDirectionId === undefined) return callback(new Error('No enough direction'));

                        const direction = data.directions[data.currentDirectionId];

                        if (!data.words) {
                            data.timer = 0;
                            return callback(null, data);
                        }

                        if (!data.timer || !data.currentWord) {
                            // Первое слово
                            data.currentWord = _.first(data.words);
                            data.words = _.tail(data.words);
                            data.timer = 16;
                        } else if (data.getNextWord) {
                            //Учет уагаданного
                            if (direction.wonWords)
                                direction.wonWords.push(data.currentWord);
                            else
                                direction.wonWords = [data.currentWord];

                            data.getNextWord = undefined;

                            //Сообщение - слово угадано
                            bot.sendMessage(direction.firstPlayerId, __buildFirstPlayerVonText(data.currentWord, direction.secondPlayerId, data.players));
                            bot.sendMessage(direction.secondPlayerId, __buildSecondPlayerVonText(data.currentWord, direction.firstPlayerId, data.players));

                            //Новое слово
                            data.currentWord = _.first(data.words);
                            data.words = _.tail(data.words);
                        }

                        data.timer--; //Уменьшаем таймер на 1

                        //Показать результат
                        Db.saveSession(guid, data, (err)=>{
                            if (err) return callback(err);

                            async.parallel([
                                    (callback) => { // обновляю таймер на станице пользователя
                                        const player = _.find(data.players, (player)=>{return player.id === direction.firstPlayerId});
                                        if (!player || !player.currentMsg) return callback(new Error("Can't find player"));

                                        bot.editMessageText(
                                            __buildPlayerOnGameText(data.currentWord||'',data.timer||0),
                                            __buildPlayerOnGameOptions(guid, player.currentMsg)).then(
                                                ()=>{callback()},
                                                ()=>{callback()});

                                    },
                                    (callback) => { // обновляю таймер на общей старнице
                                        bot.editMessageText(
                                            __buildAllDirectionsText(data.hetWelcome, data.timer, data.words||[], direction, data.directions||[], data.players),
                                            __buildAllDirectionsOptions(data.currentMsg)).then(
                                                ()=>{callback()},
                                                ()=>{callback()});
                                    }
                                ],
                                (err)=>{
                                    if (err) return callback(err);
                                    setTimeout(callback, 1000, null, data);
                                });
                        });
                    });
                },
                (data, callback)=>{
                    callback(null, !(!!data.timer && data.timer > 0))
                },
                (err,data)=>{
                    if (err) return log.error(err);
                    if (!data) return log.error(new Error('Can\'t find data'));

                    if (data.words && data.currentWord)
                        data.words.push(data.currentWord);

                    data.currentWord = undefined;
                    data.timer = undefined;
                    data.getNextWord = undefined;
                    bot.deleteMessage(msg.chat.id, msg.message_id.toString());

                    Db.saveSession(guid, data, ()=>{
                        if (data.words)
                            selectPlayer(bot, msg);
                        else
                            scoresCounting(bot, data.currentMsg);
                    });
                }
            );
        });
    });
}


function __buildFirstPlayerVonText(currentWord: string, secondPlayerId: number, players:Array<Player>) {
    return `Вы обяснили слово "${currentWord}" для ${playerIdToText(secondPlayerId,players)}`;
}

function __buildSecondPlayerVonText(currentWord: string, firstPlayerId: number, players:Array<Player>) {
    return `Вы угадали слово: "${currentWord}", которое объяснял ${playerIdToText(firstPlayerId,players)}`;
}

function __buildPlayerOnGameText(currentWord: string, timer:number) {
    return `Слово: <b>"${currentWord}"</b>\n\nОсталось ${timer} секунд...`;
}


function __buildPlayerStartGameText(coPlayerId: number, players:Array<Player>): string {
    return `Вы обясняете слова для ${playerIdToText(coPlayerId,players)}.\n\n`+
           'После того, как вы нажмете конпку "Достать слово", у вас будет 15 секунд, чтобы объяснить максимальное кол-во слов,' +
           'как только ваш парнер угадает слово жимте кнопку: "Угалал, следующее слово"';
}

function __buildPlayerStartGameButtons(guid: string): SendMessageOptions {
    const inline_keyboard: InlineKeyboardButton[][] = [
        [{
            text: "Достать слово",
            callback_data: "getWord|" + guid
        }]];

    const options: SendMessageOptions = {parse_mode: 'HTML'};

    options.reply_markup = {inline_keyboard: inline_keyboard};

    return options;
}

function __buildPlayerOnGameOptions(guid: string, msg: Message): EditMessageTextOptions {
    const options: EditMessageTextOptions = <EditMessageTextOptions>__buildPlayerStartGameButtons(guid);

    options.chat_id = msg.chat.id;
    options.message_id = msg.message_id;

    return options;
}

function __buildAllDirectionsOptions(msg: Message):EditMessageTextOptions {
    const options: EditMessageTextOptions = {parse_mode: 'HTML'};

    options.chat_id = msg.chat.id;
    options.message_id = msg.message_id;

    return options;
}

function __buildAllDirectionsText(hetWelcome:string, timer: number|undefined, words:Array<string>, currentDirection:Direction, directions: Array<Direction>, players:Array<Player>):string {
    let i :number = 0;
    return _.reduce(directions, (text, direction)=>{
        i++;
        let wonWords = '';
        if (direction.wonWords)
            wonWords = _.join(direction.wonWords, ', ');

        text += `${(currentDirection.id === direction.id)?'>':''} ${i} направление:\n  - ${playerIdToText(direction.firstPlayerId,players)}\n`+
                `  - ${playerIdToText(direction.secondPlayerId,players)}\n  Угадано: ${wonWords}\n\n`;

        return text;
    }, `4/5 Объяснение/угадывание слов "${hetWelcome}":\n\nТаймер: ${timer||'Остановлен'}\nОсталось слов: ${words.length}\n\n`);
}

