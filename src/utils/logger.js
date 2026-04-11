import path from 'node:path';
import { fileURLToPath } from 'node:url';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultLogDir = path.resolve(__dirname, '..', '..', 'logs');

export function createLogger(scope = 'app', options = {}) {
  const { level = 'info', logDir = defaultLogDir } = options;

  const formatter = winston.format.printf((info) => {
    const payload = {
      timestamp: info.timestamp,
      level: info.level,
      scope,
      message: info.message,
      ...info.metadata,
    };

    return JSON.stringify(payload);
  });

  return winston.createLogger({
    level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.metadata({ fillExcept: ['timestamp', 'level', 'message'] }),
      formatter,
    ),
    transports: [
      new winston.transports.Console(),
      new DailyRotateFile({
        dirname: logDir,
        filename: 'application-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '14d',
      }),
      new DailyRotateFile({
        dirname: logDir,
        filename: 'error-%DATE%.log',
        level: 'error',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '30d',
      }),
    ],
  });
}
