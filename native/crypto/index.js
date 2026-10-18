'use strict';
/* Loads the platform-specific napi-rs binary built by `napi build --platform`. */
const { join } = require('node:path');
const { existsSync } = require('node:fs');

const triples = {
  'win32-x64': 'win32-x64-msvc',
  'darwin-x64': 'darwin-x64',
  'darwin-arm64': 'darwin-arm64',
  'linux-x64': 'linux-x64-gnu',
};

function load() {
  const triple = triples[`${process.platform}-${process.arch}`];
  if (!triple) {
    throw new Error(`@discordy/crypto: unsupported platform ${process.platform}-${process.arch}`);
  }
  const file = join(__dirname, `discordy-crypto.${triple}.node`);
  if (!existsSync(file)) {
    throw new Error(`@discordy/crypto: native binary missing (${file}); run \`pnpm build:native\``);
  }
  return require(file);
}

module.exports = load();
