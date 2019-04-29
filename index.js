#!/usr/bin/env node

'use strict';

const url = require('url');
const path = require('path');
const http = require('http');
const fsPromises = require('fs').promises;
const cli = require('cac')('mocker-data');
const { version } = require('./package');

cli.usage('[directory] [options]');
cli.option('-p, --port [port]', 'Port to use', {
  default: '8888'
});
cli.help();
cli.version(version);
const { args, options } = cli.parse();

function errorHandler(status, message, response) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(message)
  });
  response.write(message);
  response.end();
}

function requestHandler(api, params, response) {
  const data = typeof api === 'function' ? api(params) : api;
  let dataString;
  if (!data || typeof data !== 'object') {
    return errorHandler(500, 'Wrong response data', response);
  } else {
    try {
      dataString = JSON.stringify(data);
    } catch (error) {
      return errorHandler(500, 'Wrong response data', response);
    }
  }
  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(dataString)
  });
  response.write(dataString);
  response.end();
}

http
  .createServer(async (request, response) => {
    let apis = {};
    try {
      const dir = path.join(process.cwd(), args[0] || 'mock');
      const files = await fsPromises.readdir(dir);
      files.forEach(file => {
        const filePath = path.join(dir, file);
        delete require.cache[filePath];
        apis = { ...apis, ...require(filePath) };
      });
    } catch (error) {
      return errorHandler(404, 'Not found', response);
    }

    // eslint-disable-next-line node/no-deprecated-api
    const { pathname, query } = url.parse(request.url, true);
    const api = apis[pathname];

    if (api === undefined) {
      return errorHandler(404, 'Not found', response);
    }

    if (request.method === 'GET') {
      requestHandler(api, query, response);
    } else if (request.method === 'POST') {
      let data = '';
      request.on('data', chunk => {
        data += chunk;
      });
      request.on('end', () => {
        try {
          data = JSON.parse(data);
        } catch (error) {
          return errorHandler(500, 'Wrong request data', response);
        }
        requestHandler(api, data, response);
      });
    } else {
      errorHandler(405, 'Request method not supported', response);
    }
  })
  .listen(options.port);

console.log(`Mock server is running in http://localhost:${options.port}`);
