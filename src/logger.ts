import chalk from 'chalk';

export enum LogLevel {
  None    = 0,
  Error   = 1,
  Warning = 2,
  Info    = 3,
  Debug   = 4,
}

class Logger {

  public logLevel : LogLevel = LogLevel.None;

  error (...item : any[]) {
    this.write('error', item, LogLevel.Error, '[ERROR]', '#c53932');
  }

  warning (...item : any[]) {
    this.write('warn', item, LogLevel.Warning, '[WARNING]', '#d78738');
  }

  info (...item : any[]) {
    this.write('info', item, LogLevel.Info, '[INFO]', '#dac66e');
  }

  debug (...item : any[]) {
    this.write('debug', item, LogLevel.Debug, '[DEBUG]', '#bababa');
  }

  log (...item : any[]) {
    this.write('log', item, LogLevel.None);
  }

  private write (method : keyof Console, output : any[], level : LogLevel, prefix = '', color : string = '#ffffff') {
    if (this.logLevel < level) {
      return;
    }

    const prefixColor = chalk.hex(color).dim;

    const tab       = (prefix.length < 8 ? '\t' : ' ');
    const time      = new Date();
    const f = (nb : number, total = 2) => ('0'.repeat(total) + nb).slice(-total);
    const timestamp = `${ tab }[${ f(time.getHours()) }:${ f(time.getMinutes()) }:${ f(time.getSeconds()) }.${ f(time.getMilliseconds(), 3) }]${ tab }`;

    console[method](prefixColor(prefix + timestamp), ...output);
  }
}

export const logger = new Logger();
