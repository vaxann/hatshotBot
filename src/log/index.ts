import Winston from "winston";
const { combine, timestamp, label, printf } = Winston.format;

import Module = NodeJS.Module;

const ENV = process.env.NODE_ENV;

export default function getLogger(module: Module) {
    const path:string = module.filename.split('/').slice(-2).join('/');

    const myFormat = printf((info) => {
        if (info.message.constructor === Object) {
            info.message = JSON.stringify(info.message, null, 4);
        }
        return `${info.timestamp} [${info.label}] ${info.level}: ${info.message}`;
    });

    return Winston.createLogger({
        level: 'info',
        format: combine(
            Winston.format.colorize(),
            label({label:path}),
            timestamp({format: "YYYY-MM-DD HH:mm:ss"}),
            Winston.format.splat(),
            Winston.format.simple(),
            //format.json(),
            Winston.format.prettyPrint(),
            myFormat
        ),
        transports: [
            new Winston.transports.Console({
                level: (ENV === 'development') ? 'debug' : 'info'
            }),
        ]
    });
}
