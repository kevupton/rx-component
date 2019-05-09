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

  private wasTickLast = false;

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

  tick () {
    if (this.logLevel < LogLevel.Debug) {
      return;
    }

    const color = chalk.hex('#464646').dim;

    this.wasTickLast = true;
    process.stdout.write(color('.'));
  }

  private write (output : any, level : LogLevel, prefix = '', color : string = '#ffffff') {
    if (this.logLevel < level) {
      return;
    }

    if (typeof output !== 'string') {
      output = JSON.stringify(output, undefined, 2);
    }

    this.checkTick();

    // const prefixString = prefix ? chalk.bgHex(color).hex('#000000').bold(prefix) + ' ' : '';
    const prefixColor = chalk.hex(color).dim;
    const mainColor   = chalk.hex(color);

    const tab       = (prefix.length < 8 ? '\t' : ' ');
    const time      = new Date();
    const timestamp = `${ tab }[${ ('0' + time.getHours()).slice(-2) }:${ ('0' + time.getMinutes()).slice(-2) }]${ tab }`;

    process.stdout.write(prefixColor(prefix + timestamp) + mainColor(output) + '\n');
  }

  private checkTick () {
    if (this.wasTickLast) {
      process.stdout.write('\n');
    }
    this.wasTickLast = false;
  }
}

export const logger = new Logger();
