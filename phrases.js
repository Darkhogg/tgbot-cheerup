'use strict';
const fs = require('fs');

let phraseList = Object.freeze(fs.readFileSync('./phrases.en.txt', 'utf8').trim().split('\n'));

exports.list = function list () {
    return phraseList;
}

exports.random = function () {
    return phraseList[Math.floor(Math.random() * phraseList.length)];
}
