import Log from "../log";
const log = Log(module);

import TelegramBot, {Message} from "node-telegram-bot-api";
import * as Db from "../database";
import async from "async";
import {removeSessionToPlayer, sendOrStore, playerToText, playerIdToText} from "../utils";
import _ from "lodash";
import {callbackify} from "util";
import {IHatData, Player} from "../database";


export function finishingGame(bot: TelegramBot, msg: Message) {
    if (!msg.from || !msg.from.id) return log.error(new Error('Error with mgs'));

    if (msg.chat.id === msg.from.id)
        return bot.sendMessage(msg.chat.id, "Извините, закончить игру в \"Шапку\" возможно только в групповом чате");

    Db.loadPlayerSession(msg.chat.id, (err, guid) => {
        if (err) return log.error(err);
        if (!guid) return log.error(new Error(`Can't find session by chatId=${msg.chat.id}`));

        Db.loadSession(guid, (err, data) => {
            if (err) return log.error(err);
            if (!data) return log.error(new Error(`Can't find session data by guid=${guid}`));

            removeSessionToPlayer(guid, (err)=>{
                if (err) return log.error(err);

                async.each(data.players,
                    (player, callback) => {
                        bot.sendMessage(player.id, __buildEndGameText(data.hetWelcome)).then(
                            (msg)=>{callback()},
                            (err)=>{callback()}
                        );
                    },
                    (err)=>{
                        bot.sendMessage(msg.chat.id, __buildEndGameText(data.hetWelcome));
                    });
            });
        });

    });
}

export function scoresCounting(bot: TelegramBot, msg: Message) {
    Db.loadPlayerSession(msg.chat.id, (err, guid) => {
        if (err) return log.error(err);
        if (!guid) return log.error(new Error(`Can't find session by chatId=${msg.chat.id}`));

        Db.loadSession(guid, (err, data) => {
            if (err) return log.error(err);
            if (!data) return log.error(new Error(`Can't find session data by guid=${guid}`));

            // Подсчет статистики
            _.each(data.directions, (direction)=>{
               const player = _.find(data.players, (player)=>{return player.id === direction.secondPlayerId});
               if (!player) return log.error(`Can't find playerId=${direction.secondPlayerId} in direction=${direction.id}`);
               player.wonWords = direction.wonWords;

               const team = _.find(data.teams, (team)=>{return team.id === direction.teamId});
               if (!team) return log.error(`Can't find teamId=${direction.teamId} in direction=${direction.id}`);
               if (!team.wonWords) team.wonWords = [];
               if (!direction.wonWords) direction.wonWords = [];
               team.wonWords = _.concat(team.wonWords, direction.wonWords);
            });

            bot.sendMessage(data.currentMsg.chat.id, __buildStatisticText(data));

            finishingGame(bot, msg);
        });
    });
}


function __buildEndGameText(hetWelcome: string) {
    return `Игра "${hetWelcome}" окончена`;
}

function __buildStatisticText(data:IHatData) {
    return _.reduce(data.teams, (text, team)=>{
        if (!team.wonWords) team.wonWords = [];

        text += `${team.id + 1} команда (${team.wonWords.length}):\n  - ${playerIdToText(team.firstPlayerId, data.players)}\n  - ${playerIdToText(team.secondPlayerId, data.players)}\n\n`;

        return text;
    }, `4/5 Объяснение/угадывание слов "${data.hetWelcome}":\n\n`);
}
