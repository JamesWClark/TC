var express = require('express');
var api = express();

api.get('/hi', function(req, res, next) {
    res.send('hi');
});

exports.app = api;