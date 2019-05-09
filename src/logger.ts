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

  error (item : any) {
    if (item instanceof Error) {
      item = `${ item }`;
    }
    this.write(item, LogLevel.Error, '[ERROR]', '#c53932');
  }

  warning (item : any) {
    this.write(item, LogLevel.Warning, '[WARNING]', '#d78738');
  }

  info (item : any) {
    this.write(item, LogLevel.Info, '[INFO]', '#dac66e');
  }

  debug (item : any) {
    this.write(item, LogLevel.Debug, '[DEBUG]', '#bababa');
  }

  log (item : any) {
    this.write(item, LogLevel.None);
  }

  private write (output : any, level : LogLevel, prefix = '', color : string = '#ffffff') {
    if (this.logLevel < level) {
      return;
    }

    if (typeof output !== 'string') {
      output = JSON.stringify(output, undefined, 2);
    }

    const prefixColor = chalk.hex(color).dim;
    const mainColor   = chalk.hex(color);

    const tab       = (prefix.length < 8 ? '\t' : ' ');
    const time      = new Date();
    const timestamp = `${ tab }[${ ('0' + time.getHours()).slice(-2) }:${ ('0' + time.getMinutes()).slice(-2) }]${ tab }`;

    console.log(prefixColor(prefix + timestamp) + mainColor(output));
  }
}

export const logger = new Logger();
