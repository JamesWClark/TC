/*
 * http://expressjs.com/en/guide/using-middleware.html
 * http://expressjs.com/en/advanced/best-practice-security.html
 */

var fs = require('fs');
var http = require('http');
var https = require('https');
var vhost = require('vhost');
var express = require('express');

var app = express();

var API_DOMAIN = 'sub.local.info';

var credentials = {
    key: fs.readFileSync('bin/dev-key.pem'),
    cert: fs.readFileSync('bin/dev-cert.pem')
};

var log = function(msg, obj) {
    if(obj) {
        try {
            console.log(msg + JSON.stringify(obj));
        } catch(err) {
            var simpleObject = {};
            for (var prop in obj ){
                if (!obj.hasOwnProperty(prop)){
                    continue;
                }
                if (typeof(obj[prop]) == 'object'){
                    continue;
                }
                if (typeof(obj[prop]) == 'function'){
                    continue;
                }
                simpleObject[prop] = obj[prop];
            }
            console.log('c-' + msg + JSON.stringify(simpleObject)); // returns cleaned up JSON
        }        
    } else {
        console.log(msg);
    }
};

app.use('/', express.static(__dirname + '/site'));

app.use(vhost(API_DOMAIN, require('./api.js').app));

https.createServer(credentials, app).listen(443);

http.createServer(function(req, res) {
    log('http redirect to https');
	res.writeHead(301, {'Location':'https://' + req.headers['host'] + req.url });
	res.end();
}).listen(80);

log('ready to serve');