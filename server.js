/*
 * http://expressjs.com/en/guide/using-middleware.html
 * http://expressjs.com/en/advanced/best-practice-security.html
 */

var fs = require('fs');
var http = require('http');
var https = require('https');
var vhost = require('vhost');
var express = require('express');
var bodyParser = require('body-parser');
var app = express();

var assert = require('assert');
var moment = require('moment');
var Mongo = require('mongodb').MongoClient;

var credentials = {
    key: fs.readFileSync('bin/dev-key.pem'),
    cert: fs.readFileSync('bin/dev-cert.pem')
};

var dburl = 'mongodb://localhost:27017/teachcode';

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

var validateRequest = function(req, res, next) {
    if(!req.secure) {
        res.status(403).send('http not permitted. use https instead.');
    } else {
        log('valid ok');
    }
    next();
};

app.use(validateRequest);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use('/', express.static(__dirname + '/site'));

app.use(vhost('sub.local.info', require('./api.js').app));

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
    log('http redirect to https');
	res.writeHead(301, {'Location':'https://' + req.headers['host'] + req.url });
	res.end();
}).listen(80);

log('ready to serve');