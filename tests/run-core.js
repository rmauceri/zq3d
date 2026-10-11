'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Use the application's script order so renderer math runs without a browser.
const context = vm.createContext({ console });
if (process.argv[2]) context.ZQ_TEST_FILTER = new RegExp(process.argv[2], 'i');
for (const file of ['core.js', 'renderer.js', 'tests\\core.test.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
}
const results = context.ZQ_TEST_RESULTS;
for (const result of results) {
    console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}${result.error ? `: ${result.error}` : ''}`);
}
console.log(`${results.filter(result => result.passed).length}/${results.length} passed`);
if (results.some(result => !result.passed)) process.exitCode = 1;
