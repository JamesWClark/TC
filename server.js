/*
 * http://expressjs.com/en/guide/using-middleware.html
 * http://expressjs.com/en/advanced/best-practice-security.html
 *
 * investigate HSTS + sslstrip MITM + cookie sniffing on HTTP requests
 */

var DOMAIN = 'local.info';
var COURSE_JOIN_TOKEN_LENGTH = 8;
var CLIENT_ID = '342876179484-j1svlvjorpa0bptu960gj208psn9r71t.apps.googleusercontent.com';

var fs = require('fs');
var http = require('http');
var https = require('https');
var Mongo = require('mongodb').MongoClient;
var helmet = require('helmet');
var moment = require('moment');
var express = require('express');
var request = require('request');
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
    console.log('\n');
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
                    if(callback) callback(err, doc);
                }
            });
        };
        
        Mongo.ops.find = function(collection, json, callback) {
            var col = db.collection(collection);
            col.find(json).toArray(function(err, docs) {
                if(err) {
                    log('error = ', err);
                } else {
                    log('find ' + docs.length + ' = ', docs);
                }
                if (callback) callback(docs);
            });
        };
        
        Mongo.ops.insert = function(collection, json, callback) {
            var col = db.collection(collection);
            col.insert(json, function(err, result) {
                if(err) {
                    log('error = ', err);
                } else {
                    log('insert ' + collection + ' = ', json);
                }
                if (callback) callback(err, result);
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
        
        Mongo.ops.updateOne = function(collection, query, json, callback) {
            var col = db.collection(collection);
            col.updateOne(query
                , { $set : json }
                , function(err, result) {
                    if(err) {
                        log('error = ', err);
                    } else {
                        log('update ' + collection + ' = ', result);
                        
                    }
                    if(callback) callback(err, result);
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

var errorHandler = function(err, req, res, next) {
    if(err.status) {
        res.status(err.status);
    } else {
        res.status(500);
    }
    res.render('error', { error : err });
    next(err);
};

app.use(errorHandler);

// this is middleware, runs every time
var authorizeRequest = function(req, res, next) {
    log('authorize req.url = ', req.url);
    if(req.body && req.body.a) {
        log('ok: req has body & auth');
        var auth = req.body.a;
        
        // first, is this token expired?
        var now = moment();
        var expiration = moment(auth.expiresAt);
        if(now.isAfter(expiration)) {
            // get a refresh token
        }

        // validate the token with Google
        log("ok: let's check with Google: https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=" + auth.idToken);
        request('https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=' + auth.idToken, function(err, res, body) {
            if(err) {
                log('error while validating a user id_token with Google = ', err);
                next(err);
            } else if (res.statusCode === 200) {
                var reply = JSON.parse(body);
                log('ok: Googles reply = ', reply);

                //Once you get these claims, you still need to check that the aud claim contains one of your app's client IDs.
                //If it does, then the token is both valid and intended for your client, and you can safely retrieve and use 
                //the user's unique Google ID from the sub claim.
                //https://developers.google.com/identity/sign-in/web/backend-auth#calling-the-tokeninfo-endpoint
                
                if(reply.aud === CLIENT_ID) {
                    log('ok: you may proceed');
                    next();
                } else {
                    log('fail: failed Google token validation');
                    next({ 'status' : 401, 'msg' : 'failed Google token validation' });
                }
            } else {
                next('#!@#$');
            }
        });
    } else {
        log('fail: body or auth is missing');
        next({ 'status' : 401, 'msg' : 'not authorized' });
    }
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
        Mongo.ops.find('courses', { 'userid' : user.userid }, function(docs) {
            var opts = {
                superadmin : superadmins.indexOf(user.email) === -1 ? false : true
            };
            var data = {
                courses: docs,
                options: opts
            };
            res.status(201).send(data);
        });
    }
});

app.post('/join/course', function(req, res) {
    if(req.body && req.body.a && req.body.d) {
        var token = req.body.d;
        var userid = req.body.a.userid;
        log('attempting to join course with token = ', token);
        
        // first, does the course even exist?
        Mongo.ops.findOne('courses', { 'joinToken' : token }, function(err, course) {
            if (err) {
                log('error from ' + req.url + ' = ',  err);
            } else if (course) { // yes - course exists
                // wait, are you already in the course?
                Mongo.ops.findOne('studentsInCourses', { 'courseid' : course._id, 'userid' : userid }, function(err, doc) {
                    if (err) {
                        log('error from ' + req.url + ' = ', err);
                    } else if (doc) {
                        log(userid + ', you\'re already in the course! GTFO');
                        res.status(400).send("You're already in this course.");
                    } else {
                        // hmm, you might be able to join but do you own the course?
                        Mongo.ops.findOne('courses', { '_id' : course._id, 'userid' : userid }, function(err, doc) {
                            if (err) {
                                log('error from ' + req.url + ' = ', err);
                            } else if (doc) {
                                log(userid + ' wait, you ARE the owner :S');
                                res.status(400).send("You can't join your own course");
                            } else {
                                log('ok: you may join the course = ', course);
                                var studentInCourse = {
                                    'userid' : req.body.a.userid,
                                    'courseid' : course._id
                                };
                                Mongo.ops.insert('studentsInCourses', studentInCourse, function(err, doc) {
                                    if(err) {
                                        log('fail: error joining course = ', err);
                                    } else {
                                        log('user ' + userid + ' joined course ' + course.title + ' with token = ' + token);
                                        res.status(201).send(course);
                                    }
                                });                
                            }
                        });
                    }
                });
            } else { // no - course not found
                log('fail: course not found');
                res.status(404).send('');
            }
        });
    } else {
        res.status(400).send('');
    }
});

app.post('/suspend/course', function(req, res) {
    if(req.body && req.body.a && req.body.d) {
        var joinToken = req.body.d;
        log('suspend course with token = ', joinToken);
        var query = { 'joinToken' : req.body.d };
        var json = { 'suspend' : true };
        Mongo.ops.updateOne('courses', query, json, function(err, result) {
            if(err) {
                log('error = ', err);
                res.status(400).send('');
            } else {
                log('result = ', result);
                res.status(201).send(joinToken);
            }
        });
    }
});

app.post('/course', function(req, res) {
    if(req.body && req.body.a && req.body.d) {
        var auth         = req.body.a;
        var course       = req.body.d;
        course.userid    = auth.userid;
        course.creation  = moment().format('x');
        course.joinToken = generateJoinToken(COURSE_JOIN_TOKEN_LENGTH);

        log('received create-course request');
        log('auth = ', auth);
        log('course = ', course);

        Mongo.ops.insert('courses', course);
        res.status(201).send(course);
    } else {
        res.status(400).send('');
    }
});

app.post('/create/programmingtask', function(req, res) {
    if(req.body && req.body.a && req.body.d) {
        var auth = req.body.a;
        var task = req.body.d;
        
        log('task = ', task);
        
        Mongo.ops.insert('tasks', task);
        res.status(201).send(task);
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