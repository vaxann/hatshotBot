import Log from "../log";
const log = Log(module);

import TelegramBot, {
    EditMessageTextOptions,
    InlineKeyboardButton,
    Message,
    SendMessageOptions
} from "node-telegram-bot-api";
import * as Db from "../database";
import {Team} from "../database";
import async from "async";
import {sendOrStore, playerToText, playerIdToText} from "../utils";
import _ from "lodash";
import {selectPlayer} from "./gaming";

//TODO: Написать текст, о перегенрации пвр

export function showTeams(bot:TelegramBot, guid: string, isEditMsg=false): void {
    Db.loadSession(guid, (err, data) => {
        if (!data || !data.teams) return log.error(new Error('No enough pairs'));

        async.reduce(data.teams, `3/5 Формирование команд "${data.hetWelcome}":\n\n`,
            (memo, team, callback) => {
                if (!memo) return log.error(new Error('No initial data to reduce'));
                memo += `${team.id+1} команда:\n  - ${playerIdToText(team.firstPlayerId, data.players)}\n  - ${playerIdToText(team.secondPlayerId,data.players)}\n\n`;

                async.each([team.firstPlayerId, team.secondPlayerId],
                    (playerId, callback) => {
                        const coPlayerId = (playerId === team.firstPlayerId)?team.secondPlayerId:team.firstPlayerId;
                        if (!coPlayerId) return callback(new Error('Can\'t find partner'));

                        sendOrStore(bot, playerId, `Ваша команда ${team.id+1},\nВаш партнер: ${playerIdToText(coPlayerId,data.players)}`, {parse_mode: 'HTML'}, callback);
                    },
                    (err) => {
                        if (err) return callback(err);
                        callback(null, memo);
                    }
                );
            },
            (err, results) => {
                if (err) return log.error(err);
                if (!results) return log.error(new Error('Cant\'t find stopPlayersCollecting text for player pairs'));

                if (isEditMsg) {
                    bot.editMessageText(results, __buildShowPlayersPairsOptions(data.currentMsg));
                } else {
                    const admin = _.first(data.players);
                    if (!admin) return  log.error('Can\'t find Admin');

                    bot.sendMessage(data.currentMsg.chat.id, results, {parse_mode: 'HTML'}).then((msg)=>{
                        data.currentMsg = msg;

                        bot.sendMessage(admin.id, __buildAdminShowPlayersPairsText(data.hetWelcome, false),
                            __buildAdminShowPlayersPairsButtons(guid, false)).then((msg)=>{
                                admin.currentMsg = msg;
                                Db.saveSession(guid,data,(err)=>{if (err) return log.error(err)});
                        });
                    });
                }
            }
        );
    });
}


export function buildTeams(bot:TelegramBot, msg: Message, isEditMsg=false): void {
    Db.loadPlayerSession(msg.chat.id, (err, guid) => {
        if (err) return log.error(err);
        if (!guid) return log.error(new Error("Can't find session"));

        Db.loadSession(guid, (err, data) => {
            if (!data || !data.players) return log.error(new Error('No enough players'));

            const random = _.shuffle(data.players);  // Перемешиваем игроков
            data.teams = _
                .chain(random)
                .map((player)=>{return player.id})
                .chunk(2)
                .reduce((teams, pair) =>{
                    teams.push(<Team>{id:teams.length,firstPlayerId:_.first(pair)||-1, secondPlayerId:_.last(pair)||-1})
                    return teams;
                    }, <Array<Team>>[])  // Делим на пары
                .value();

            if (random.length % 2) // если игроков нечетное число
                data.teams[data.teams.length - 1].secondPlayerId = data.teams[data.teams.length - 2].firstPlayerId; // то дополнить последнюю пару (из одного человека) вторым человеком из пердполедней пары

            data.players = _.map(data.players, (player) => {
                const teamId =  _
                    .chain(data.teams)
                    .filter((team)=>{return (team.firstPlayerId === player.id || team.secondPlayerId === player.id)})
                    .map((team)=>{return team.id})
                    .value();

                player.teamId = (teamId.length > 1)?teamId:_.first(teamId);

                return player;
            });

            Db.saveSession(guid, data, (err) => {
                if (err) return log.error(err);

                showTeams(bot, guid, isEditMsg);
            });
        });

    });
}

export function finishTeamsBuilding(bot:TelegramBot, msg: Message) {
    Db.loadPlayerSession(msg.chat.id, (err, guid) => {
        if (err) return log.error(err);
        if (!guid) return log.error(new Error("Can't find session"));

        Db.loadSession(guid, (err, data) => {
            if (!data || !data.players) return log.error(new Error('No enough players'));

            data.flow = "gaming";

            Db.saveSession(guid, data, (err)=>{
                const admin = _.first(data.players);
                if (!admin || !admin.currentMsg) return  log.error('Can\'t find Admin');

                bot.editMessageText(__buildAdminShowPlayersPairsText(data.hetWelcome, true),
                    __buildAdminShowPlayersPairsButtonsEdit(guid, admin.currentMsg, true));

                selectPlayer(bot,msg,true);
            });
        });
    });
}

function __buildAdminShowPlayersPairsButtons(guid: string, isFinished: boolean): SendMessageOptions {
    const inline_keyboard: InlineKeyboardButton[][] = [
        [{
            text: "Переформировать команды",
            callback_data: "rebuildTeams|" + guid
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

function __buildAdminShowPlayersPairsButtonsEdit(guid: string, msg: Message, isFinished: boolean): EditMessageTextOptions {
    const options: EditMessageTextOptions = <EditMessageTextOptions>__buildAdminShowPlayersPairsButtons(guid, isFinished);

    options.chat_id = msg.chat.id;
    options.message_id = msg.message_id;

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

