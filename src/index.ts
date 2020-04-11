import TelegramBot, {ConstructorOptions, User} from "node-telegram-bot-api";

import Log from "./log";
const log = Log(module);

import {
    startPlayersCollection,
    addPlayer,
    stopPlayersCollection
} from "./flow/players-collecting";
import {startWordsCollecting, collectWord, stopWordsCollection, restartWordsCollecting} from "./flow/words-collecting";
import Config from "./config";
import {sendOrStore, sendStored} from "./utils"
import * as Db from "./database";

// @ts-ignore
import Agent from "socks5-https-client/lib/Agent"
import {finishingGame} from "./flow/scores-counting";
import {buildPairs} from "./flow/pairs-building";

enum ActionType {
    addPlayer,  stopPlayersCollecting, stopWordsCollecting, restartWordsCollecting, rebuildPairs , startGame
}

//TODO: add config validation
const token:string = Config.get('telegram_bot:token');
const options:ConstructorOptions = Config.get('telegram_bot:options');

if (options.request)
    options.request.agentClass = Agent;

const bot = new TelegramBot(token,options);


bot.onText(/^\/hat\s+([^]+)/, (msg, match)=>{
    startPlayersCollection(bot, msg, match);
});

bot.onText(/\/info$|\/start$/, (msg)=>{
    if (!msg.from || !msg.from.id) return log.error(new Error('Error with Telegram'));
    if (msg.chat.id !== msg.from.id) return;
    bot.sendMessage(msg.chat.id, "Бот для многопользовательской игры в \"Шапку\"").then(()=>{
        sendStored(bot, msg.chat.id);
    });
});

/*bot.onText(/\/words$/, (msg) => {
    startWordsCollecting(bot, msg);
});*/

bot.onText(/\/unhat$/, (msg) => {
    finishingGame(bot, msg);
});

bot.on('message', (msg) => {
    log.debug(msg);
    collectWord(bot, msg);
});


bot.on('callback_query', (query) => {
    const msg = query.message;
    if (!msg) return log.error(new Error('Error with Telegram'));

    const player:User =  query.from;

    if (!query.data) return log.error(new Error('No query.data comes'));
    const actionParams = query.data.split("|");
    if (actionParams.length !== 2) return log.error(new Error('No action enough params found'));
    const action: ActionType | undefined  = (<any>ActionType)[actionParams[0]];
    if (action === undefined) return log.error(new Error('No action found'));
    const guid: string = actionParams[1];

    switch (action) {
        case ActionType.addPlayer: {
            addPlayer(bot, guid, player, msg);
            break;
        }
        case ActionType.stopPlayersCollecting:{
            stopPlayersCollection(bot, guid, msg);
            break;
        }
        case ActionType.restartWordsCollecting:{
            restartWordsCollecting(bot, msg);
            break;
        }
        case ActionType.stopWordsCollecting:{
            stopWordsCollection(bot, msg);
            break;
        }
        case ActionType.rebuildPairs: {
            buildPairs(bot,msg,true);
            break;
        }
    }
});


Db.showAllPlayerSessions();