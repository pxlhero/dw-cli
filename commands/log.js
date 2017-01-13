const stream = require('stream');
const debug = require('debug')('log');
const groupBy = require('lodash/groupBy');
const sortBy = require('lodash/sortBy');
const forEach = require('lodash/forEach');
const map = require('lodash/map');
const compact = require('lodash/compact');
const includes = require('lodash/includes');
const chalk = require('chalk');
const log = require('../lib/log');
const read = require('../lib/read');
const find = require('../lib/find');

module.exports = async ({webdav, request, options}) => {
  try {
    log.info(`Streaming log files from ${webdav}`);
    let files = await find('Logs', request);

    // only log files
    files = files.filter(({displayname}) => displayname.includes('.log'));

    // group by log type
    const groups = groupBy(files, ({displayname}) => displayname.split('-blade')[0]);

    if (options.levelFilter.length) {
      groups = groups.filter((group, name) => options.levelFilter.includes(name));
    }

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
      const promises = map(groups, async ({displayname}, name) => {
        try {
          const body = await read(`Logs/${displayname}`, request);
          debug(`Read ${displayname}`);
          return {body, name};
        } catch (err) {
          log.error(err);
        }
      });

      const results = await Promise.all(promises);

      forEach(compact(results), ({body, name}) => {
        const lines = body.split('\n').slice(-options.numberLines);

        forEach(lines, line => {
          if (line && !includes(logs[name], line)) {
            logs[name].push(line);
            let message = `${chalk.white(name)} ${line}`;
            if (options.messageLength) {
              message = message.slice(0, options.messageLength * 2);
            }
            if (!options.messageFilter || (options.messageFilter && new RegExp(options.messageFilter).test(message))) {
              logStream.push(message);
            }
          }
        });
      });

      setTimeout(tail, options.pollInterval * 1000);
    };

    tail();
  } catch (err) {
    log.error(err);
  }
};
