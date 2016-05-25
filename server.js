/*
 * http://expressjs.com/en/guide/using-middleware.html
 * http://expressjs.com/en/advanced/best-practice-security.html
 *
 * investigate HSTS + sslstrip MITM + cookie sniffing on HTTP requests
 */

var DOMAIN = 'local.info';

var fs = require('fs');
var http = require('http');
var https = require('https');
var Mongo = require('mongodb').MongoClient;
var helmet = require('helmet');
var moment = require('moment');
var express = require('express');
var bodyParser = require('body-parser');

var app = express();

var credentials = {
    key: fs.readFileSync('bin/key.pem'),
    cert: fs.readFileSync('bin/cert.pem')
};

var mongo_url = 'mongodb://localhost:27017/teachcode';

var superadmins = ['jwclark@rockhursths.edu'];
var domains = ['rockhursths.edu','amdg.rockhursths.edu'];
var tokenSet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

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

var generateJoinToken = function(length) {
    var token = '';
    for(var i = 0; i < length; i++) {
        var random = Math.floor(Math.random() * tokenSet.length);
        token += tokenSet[random];
    }
    return token;
};

Mongo.connect(mongo_url, function(err, db) {
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
        
        Mongo.ops.updateOrCreate = function(collection, json, key) {
            var col = db.collection(collection);
            col.updateOne(
                key
                , { $set : { firstName : 'hahahahaha' } }
                , function (err, result) {
                    console.log('updated the document');
                }
            );
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
    var user = req.body;
    var login = {
        userid : user.userid,
        ip : req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        timestamp : moment().format('x')
    };
    
    Mongo.ops.insertJson('logins', login);
    Mongo.ops.updateOrCreate('users', user, { userid : user.userid });
    
    res.status(201).send('');
});

https.createServer(credentials, app).listen(443);

// only redirect the home page. 403 forbid all others
http.createServer(function(req, res) {
    log('catch a redirect (is HSTS working?)');
    if (req.headers.host + req.url === DOMAIN + '/') {
        res.writeHead(301, { 'Location' : 'https://' + req.headers.host + req.url });
        res.end();
    } else {
        res.writeHead(403);
        res.end();
    }
}).listen(80);

log('ready to serve');