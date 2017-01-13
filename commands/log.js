const stream = require('stream');
const debug = require('debug')('log');
const groupBy = require('lodash/groupBy');
const sortBy = require('lodash/sortBy');
const forEach = require('lodash/forEach');
const includes = require('lodash/includes');
const map = require('lodash/map');
const chalk = require('chalk');
const log = require('../lib/log');
const read = require('../lib/read');
const find = require('../lib/find');

module.exports = async ({webdav, request, logPollInterval, logMessageLength, logMessageFilter}) => {
  try {
    log.info(`Streaming log files from ${webdav}`);
    let files = await find('Logs', request);

    // only log files
    files = files.filter(file => file.displayname.includes('.log'));

    // group by log type
    const groups = groupBy(files, file => file.displayname.split('-blade')[0]);
    const logs = [];

    // sort files by last modified, setup logs
    forEach(groups, (files, name) => {
      logs[name] = [];
      groups[name] = sortBy(files, file => new Date(file.getlastmodified)).reverse()[0];
    });

    const logStream = new stream.Readable();
    logStream._read = () => {};

    logStream.on('data', message => {
      log.plain(message, 'blue');
    });

    // every 1 second tail from the environment
    const tail = async () => {
      debug('Doing it');
      const promises = map(groups, async (file, name) => {
        const body = await read(`Logs/${file.displayname}`, request);
        debug(`Read ${file.displayname}`);
        return {body, name};
      });

      const results = await Promise.all(promises);

      forEach(results, ({body, name}) => {
        const lines = body.split('\n').slice(-10);

        forEach(lines, line => {
          if (line && !includes(logs, name)) {
            logs[name].push(line);
            let message = `${chalk.white(name)} ${line}`;
            if (logMessageLength) {
              message = message.slice(0, logMessageLength * 2);
            }
            if (!logMessageFilter || (logMessageFilter && new RegExp(logMessageFilter).test(message))) {
              logStream.push(message);
            }
          }
        });
      });

      setTimeout(tail, logPollInterval * 1000);
    };

    tail();
  } catch (err) {
    log.error(err);
  }
};
