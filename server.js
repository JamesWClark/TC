/*
 * http://expressjs.com/en/guide/using-middleware.html
 * http://expressjs.com/en/advanced/best-practice-security.html
 */

var fs = require('fs');
var http = require('http');
var https = require('https');
var vhost = require('vhost');
var helmet = require('helmet');
var express = require('express');

var app = express();

var DOMAIN = 'local.info';
var API_DOMAIN = 'sub.local.info';

var credentials = {
    key: fs.readFileSync('bin/key.pem'),
    cert: fs.readFileSync('bin/cert.pem')
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

app.use(helmet.noCache());
app.use(helmet.frameguard());
app.use(helmet.noSniff());
app.use(helmet.hsts({
    maxAge: 2592000000, // 30 days in milliseconds
    includeSubdomains: true
}));

app.use('/', express.static(__dirname + '/site'));
app.use(vhost(API_DOMAIN, require('./api.js').app));

https.createServer(credentials, app).listen(443);

http.createServer(function(req, res) {
    if(req.host === DOMAIN) {
        log('redirecting home');
        res.writeHead(301, {'Location':'https://' + req.headers.host + req.url });
        res.end();
    } else {
        log('forbidden caught');
        res.writeHead(403);
        res.end();
    }
}).listen(80);

log('ready to serve');