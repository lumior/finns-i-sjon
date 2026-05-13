/**
 * Structured logger
 * JSON-format för produktion, människovänligt för utveckling
 */

const isProduction = process.env.NODE_ENV === 'production';

class Logger {
    constructor(context) {
        this.context = context || 'app';
    }

    _log(level, message, meta = {}) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            context: this.context,
            message,
            ...meta
        };

        if (isProduction) {
            console.log(JSON.stringify(entry));
        } else {
            const color =
                {
                    error: '\x1b[31m',
                    warn: '\x1b[33m',
                    info: '\x1b[36m',
                    debug: '\x1b[90m'
                }[level] || '';
            const reset = '\x1b[0m';
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
            console.log(
                `${color}[${entry.timestamp}] [${level.toUpperCase()}] [${this.context}] ${message}${metaStr ? ' ' + metaStr : ''}${reset}`
            );
        }
    }

    error(message, meta) {
        this._log('error', message, meta);
    }
    warn(message, meta) {
        this._log('warn', message, meta);
    }
    info(message, meta) {
        this._log('info', message, meta);
    }
    debug(message, meta) {
        this._log('debug', message, meta);
    }
}

function createLogger(context) {
    return new Logger(context);
}

module.exports = { Logger, createLogger };
