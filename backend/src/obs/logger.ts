import { env } from '../config/env.js';

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

const levels: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

const configuredLevel = (env.LOG_LEVEL as LogLevel) ?? 'info';
const configuredLevelNum = levels[configuredLevel] ?? levels.info;

function log(level: LogLevel, msg: string, data?: Record<string, unknown>) {
  if (levels[level] < configuredLevelNum) return;
  const entry = {
    time: new Date().toISOString(),
    level,
    msg,
    ...data,
  };
  if (level === 'error') {
    process.stderr.write(JSON.stringify(entry) + '\n');
  } else {
    process.stdout.write(JSON.stringify(entry) + '\n');
  }
}

export const logger = {
  trace: (msg: string, data?: Record<string, unknown>) => log('trace', msg, data),
  debug: (msg: string, data?: Record<string, unknown>) => log('debug', msg, data),
  info: (msg: string, data?: Record<string, unknown>) => log('info', msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => log('warn', msg, data),
  error: (msg: string, data?: Record<string, unknown>) => log('error', msg, data),
};
