var fs = require('fs');
var http = require('http');
var https = require('https');
var express = require('express');
var app = express();

var credentials = {
    key: fs.readFileSync('bin/dev-key.pem'),
    cert: fs.readFileSync('bin/dev-cert.pem')
};

https.createServer(credentials, app).listen(443);


http.createServer(function(req, res) {
	res.writeHead(301, {'Location':'https://' + req.headers['host'] + req.url });
	res.end();
}).listen(80);


app.use('/', express.static(__dirname + '/site'));
