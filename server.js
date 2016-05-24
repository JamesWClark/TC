/*
 * http://expressjs.com/en/guide/using-middleware.html
 * http://expressjs.com/en/advanced/best-practice-security.html
 *
 * investigate HSTS + sslstrip MITM + cookie sniffing on HTTP requests
 */

var fs = require('fs');
var http = require('http');
var https = require('https');
var vhost = require('vhost');
var helmet = require('helmet');
var express = require('express');
var bodyParser = require('body-parser');

var app = express();

var assert = require('assert');
var moment = require('moment');
var Mongo = require('mongodb').MongoClient;

var dburl = 'mongodb://localhost:27017/teachcode';

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

Mongo.connect(dburl, function(err, db) {
    if(err) {
        log('error = ', err);
    } else {
        log('connected to mongodb');
        Mongo.ops = {};
        Mongo.ops.insertJson = function(collection, json) {
            var col = db.collection(collection);
            col.insert(json, function(err, result) {
                if(err) {
                    log('error = ', err);
                } else {
                    log('insert into ' + collection + ': ', json);
                }
            });
        };
    }
});

app.use(helmet.noCache());
app.use(helmet.frameguard());
app.use(helmet.noSniff());
app.use(helmet.hsts({
    maxAge: 2592000000, // 30 days in milliseconds
    includeSubdomains: true
}));

app.use('/', express.static(__dirname + '/site'));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use('/user/:id',
        
    function(req, res, next) {
      console.log('Request URL:', req.originalUrl);
      next();
    }, 
        
    function (req, res, next) {
      console.log('Request Type:', req.method);
      next();
    }
);

app.post('/signin', function(req, res) {
    log('post: /signin = ', data);
    
    var data = req.body;
    data.timestamp = moment().format('x');
    data.ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    
    Mongo.ops.insertJson('logins', data);
    res.status(201).send('');
});

https.createServer(credentials, app).listen(443);

http.createServer(function(req, res) {
    res.writeHead(301, { 'Location' : 'https://' + req.headers.host + req.url });
    res.end();
}).listen(80);

log('ready to serve');