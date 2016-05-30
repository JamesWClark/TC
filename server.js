/*
 * http://expressjs.com/en/guide/using-middleware.html
 * http://expressjs.com/en/advanced/best-practice-security.html
 *
 * investigate HSTS + sslstrip MITM + cookie sniffing on HTTP requests
 */

var DOMAIN = 'local.info';
var COURSE_JOIN_TOKEN_LENGTH = 8;

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

var superadmins = ['jwclark@rockhursths.edu','this.clark@gmail.com'];
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
        log('MongoDB connection error = ', err);
    } else {
        log('connected to mongodb');
        
        Mongo.ops = {};
        
        Mongo.ops.findOne = function(collection, json, callback) {
            var col = db.collection(collection);
            col.findOne(json, function(err, doc) {
                if(err) {
                    log('error = ' + err);
                } else {
                    log('findOne = ', doc);
                    callback(doc);
                }
            });
        };
        
        Mongo.ops.insert = function(collection, json) {
            var col = db.collection(collection);
            col.insert(json, function(err, result) {
                if(err) {
                    log('error = ', err);
                } else {
                    log('insert ' + collection + ' = ', json);
                }
            });
        };
        
        Mongo.ops.upsert = function(collection, query, json) {
            var col = db.collection(collection);
            col.updateOne(query
                , { $set : json }
                , { upsert : true }
                , function (err, result) {
                    if(err) {
                        log('error = ', err);
                    } else {
                        log('upsert ' + collection + ' = ', result);
                    }
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

var authorizeRequest = function(req, res, next) {
    log('authorizeRequest middlware, req.url = ', req.url);
    if(req.url === '/signin') {
        log('skipping /signin auth middleware');
    } else {
        if(req.body && req.body.a) {
            var auth = req.body.a;
            Mongo.ops.findOne('users', auth, function(doc) {
                if(doc && doc.expiresAt && doc.idToken) {
                    var now = moment();
                    var expiration = moment(doc.expiresAt);
                    if(auth.idToken && doc.idToken) {
                        if (auth.idToken !== doc.idToken || now.isAfter(expiration)) {
                            res.status(401).send('not authorized'); // not authorized
                        }
                    }                    
                } else {
                    res.status(401).send('not authorized');
                }
            });
        }else {
            res.status(401).send('not authorized');
        }
    }
    next();
};

app.use(authorizeRequest);

// test stub
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
    var user = req.body.d;
    log('received user = ', user);
    if(false) { // test with any account
    //if(domains.indexOf(user.domain) === -1) { // domain not approved
        res.status(403).send('Currently, this app is available only to Rockhurst High School students.');
    } else {
        var login = {
            userid : user.userid,
            ip : req.headers['x-forwarded-for'] || req.connection.remoteAddress,
            timestamp : moment().format('x')
        };

        Mongo.ops.insert('logins', login);
        Mongo.ops.upsert('users', { 'userid' : user.userid }, user);

        var options = {
            superadmin : superadmins.indexOf(user.email) === -1 ? false : true
        };
        res.status(201).send(options);
    }
});

app.post('/course', function(req, res) {
    if(req.body && req.body.a && req.body.d) {
        var auth   = req.body.a;
        var course = req.body.d;
        course.userid = auth.userid;
        course.creation = moment().format('x');
        course.joinToken = generateJoinToken(COURSE_JOIN_TOKEN_LENGTH);

        log('received create-course request');
        log('auth = ', auth);
        log('course = ', course);

        Mongo.ops.insert('courses', course);
        res.status(201).send(course.joinToken);
    } else {
        res.status(400).send('');
    }
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