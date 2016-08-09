/*
 * http://expressjs.com/en/guide/using-middleware.html
 * http://expressjs.com/en/advanced/best-practice-security.html
 *
 * investigate HSTS + sslstrip MITM + cookie sniffing on HTTP requests
 */

var DOMAIN = 'local.info';
var COURSE_JOIN_TOKEN_LENGTH = 8;
var CLIENT_ID = '342876179484-j1svlvjorpa0bptu960gj208psn9r71t.apps.googleusercontent.com';

var fs         = require('fs');
var jws        = require('jws');
var jwt        = require('jsonwebtoken');
var http       = require('http');
var https      = require('https');
var Mongo      = require('mongodb').MongoClient;
var ObjectId   = require('mongodb').ObjectID;
var helmet     = require('helmet');
var moment     = require('moment');
var express    = require('express');
var request    = require('request');
var jwkToPem   = require('jwk-to-pem');
var bodyParser = require('body-parser');

var app = express();

var credentials = {
    key:  fs.readFileSync('bin/key.pem'),
    cert: fs.readFileSync('bin/cert.pem')
};

var mongo_url = 'mongodb://localhost:27017/teachcode';

var superadmins = ['jwclark@rockhursths.edu','this.clark@gmail.com'];
var domains = ['rockhursths.edu','amdg.rockhursths.edu'];
var tokenSet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// logger that prevents circular object reference in javascript
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
            console.log('circular-' + msg + JSON.stringify(simpleObject)); // returns cleaned up JSON
        }        
    } else {
        console.log(msg);
    }
};

// pull the userid from idtoken in authorization header
var getUserId = function(req) {
    var idToken = req.headers.authorization;
    return jwt.decode(idToken).sub; // ex json: http://www.jsonmate.com/permalink/57a0b6b84fef248c399c5de0
};

// generate a join token for courses
var generateJoinToken = function(length) {
    var token = '';
    for(var i = 0; i < length; i++) {
        var random = Math.floor(Math.random() * tokenSet.length);
        token += tokenSet[random];
    }
    return token;
};

// mongodb operations
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
                    log('Mongo.ops.findOne.error = ', err);
                } else {
                    log('Mongo.ops.findOne = ', doc);
                    if(callback) callback(err, doc);
                }
            });
        };
        
        Mongo.ops.find = function(collection, json, callback) {
            var col = db.collection(collection);
            col.find(json).toArray(function(err, docs) {
                if(err) {
                    log('Mongo.ops.find.error = ', err);
                } else {
                    log('Mongo.ops.find = ' + docs.length + ' = ', docs);
                }
                if (callback) callback(docs);
            });
        };
        
        Mongo.ops.insert = function(collection, json, callback) {
            var col = db.collection(collection);
            col.insert(json, function(err, result) {
                if(err) {
                    log('Mongo.ops.insert.error = ', err);
                } else {
                    log('Mongo.ops.insert = ' + collection + ' = ', json);
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
                        log('Mongo.ops.upsert.error = ', err);
                    } else {
                        log('Mongo.ops.upsert = ' + collection + ' = ', result);
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
                        log('Mongo.ops.updateOne = ' + collection + ' = ', result);
                        
                    }
                    if(callback) callback(err, result);
                }
            );
        };
    }
});

// helmet stuff
app.use(helmet.noCache());
app.use(helmet.frameguard());
app.use(helmet.noSniff());
app.use(helmet.hsts({
    maxAge: 2592000000, // 30 days in milliseconds
    includeSubdomains: true
}));

// static file serving
app.use('/', express.static(__dirname + '/site'));

// body parsing ensures req.body property
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// error handling middleware
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

// middleware: authorize every request by validating an idToken issued by google
var authorizeRequest = function(req, res, next) {
    log('authorizing request from url = ', req.url);
    if(req.body && req.headers && req.headers.authorization) {
        var idToken = req.headers.authorization;
        var decodedToken = jwt.decode(idToken, { complete : true });  // ex: http://www.jsonmate.com/permalink/57a0372c4fef248c399c5dd6        
        var keyID = decodedToken.header.kid;
        var algorithm = decodedToken.header.alg;

        // request google well known config for verifying the JWK or PEM, see:
        // http://ncona.com/2015/02/consuming-a-google-id-token-from-a-server/
        // should only make this request once every 24 hours?
        request('https://accounts.google.com/.well-known/openid-configuration', function(err, res, body) {
            if(err) {
                log('fail: could not connect to google well-known configuration = ', err);
                next({ 'status' : 401, 'msg' : 'could not connect to google well-known configuration' });
            } else {
                // try catch something here - all kinds of bad data could pass through here
                // use express error middleware?
                var wellknownconfig = JSON.parse(body);
                var jsonwebkeys_uri = wellknownconfig.jwks_uri; // ex: https://www.googleapis.com/oauth2/v3/certs
                
                request(jsonwebkeys_uri, function(err, res, body) {
            
                    // get the public keys array
                    var keysarray = JSON.parse(body).keys;
            
                    // get only the key that matches the keyID from the original idToken above
                    var jwk = keysarray.filter(function(key) {
                        return key.kid === keyID;
                    })[0];
                    
                    // convert this key to PEM format
                    var pem = jwkToPem(jwk);
                    
                    // verify the authenticity of the idToken
                    // what about expiration date set by Google? idk but this verifier caught the expiration date...
                    // maybe i just need to timestamp the first appearance on my end?
                    jwt.verify(idToken, pem, { audience : CLIENT_ID, issuer : 'accounts.google.com', algorithms : [ algorithm ] }, function(err, decoded) {
                        if(err) {
                            log('fail: idToken validation error = ', err);
                            next({ 'status' : 401, 'msg' : 'failed Google id_token validation' });
                        } else {
                            var authorized = jws.verify(idToken, algorithm, pem); // true or false
                            log('decoded idToken = ', decoded);
                            log('authorized = ', authorized);
                            if(authorized) {
                                log('ok: idToken authorized');
                                next();
                            } else {
                                log('fail: Google id_token validation');
                                next({ 'status' : 401, 'msg' : 'failed Google id_token validation' });
                            }
                        }
                    });
                });
            }
        });
    } else {
        log('fail: body missing');
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

// a user signs in with google web login
app.post('/signin', function(req, res) {
    var user = req.body;
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
        
        // get courses this user joined as a student
        Mongo.ops.find('studentsInCourses', { 'userid' : user.userid }, function(docs) {
            log('this user has studentsInCourses = ', docs);
            var a = [];
            docs.forEach(function(ele) {
                a.push({ '_id' : ele.courseid });
            });
            a. push({ 'userid' : user.userid });
            log('built an array a = ', a);
            
            // get courses owned by this user
            Mongo.ops.find('courses', { $or : a }, function(docs) {
                var opts = {
                    superadmin : superadmins.indexOf(user.email) === -1 ? false : true
                };
                var data = {
                    courses: docs,
                    options: opts
                };

                res.status(201).send(data); // i could sign my own auth tokens and send them in the authorization header instead
            });
        });
    }
});

// join a course
app.post('/join/course', function(req, res) {
    var token = req.body.joinToken;
    var userid = getUserId(req);
    log('attempting to join course with token = ' + token + ' for userid = ' + userid);

    // first, does the course even exist?
    Mongo.ops.findOne('courses', { 'joinToken' : token }, function(err, course) {
        if (err) {
            log('error from ' + req.url + ' = ',  err);
            // this may be naive - shouldn't I be conditioined on the err itself for various cases, not simply found or not found?
            res.status(404).send("Did not find one course with joinToken = " + token);
            next(err);
        } else if (course) { // yes - course exists
            // wait, are you already in the course?
            Mongo.ops.findOne('studentsInCourses', { 'courseid' : course._id, 'userid' : userid }, function(err, doc) {
                if (err) {
                    log('error from ' + req.url + ' = ', err);
                } else if (doc) {
                    log(userid + ', you\'re already in the course! GTFO');
                    res.status(403).send("You're already in this course.");
                } else {
                    // hmm, you might be able to join but do you own the course?
                    Mongo.ops.findOne('courses', { '_id' : course._id, 'userid' : userid }, function(err, doc) {
                        if (err) {
                            log('error from ' + req.url + ' = ', err);
                        } else if (doc) {
                            log(userid + ' wait, you ARE the owner :S');
                            res.status(403).send("You can't join your own course");
                        } else {
                            log('ok: you may join the course = ', course);
                            var studentInCourse = {
                                'userid' : userid,
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
});

// suspend a course
app.post('/suspend/course', function(req, res) {
    var joinToken = req.body.joinToken;
    log('suspend course with token = ', joinToken);
    var query = { 'joinToken' : joinToken };
    var json = { 'suspend' : true };
    Mongo.ops.updateOne('courses', query, json, function(err, result) {
        if(err) {
            log('suspend course error = ', err);
            res.status(400).send('');
        } else {
            log('suspend course result = ', result);
            res.status(201).send(joinToken);
        }
    });
});

// create a course
app.post('/course', function(req, res) {
    var course       = req.body;
    course.userid    = getUserId(req);
    course.creation  = moment().format('x');
    course.joinToken = generateJoinToken(COURSE_JOIN_TOKEN_LENGTH);

    log('received create-course request');
    log('course = ', course);

    Mongo.ops.insert('courses', course);
    res.status(201).send(course);
});

// get tasks from course
app.get('/course/tasks', function(req, res) {
    if(req.query && req.query.cid) {
        var courseid = req.query.cid;
        log('get tasks for courseid = ' + courseid);
        Mongo.ops.find('tasks', { 'courseid' : courseid }, function(docs) {
            log("/course/tasks get tasks = ", docs);
            res.status(200).send(docs);
        });
    } else {
        res.status(400).send('bad request');
    }
});

// create a course programming task
app.post('/create/programmingtask', function(req, res) {
    var task = req.body;
    var userid = getUserId(req);
    log('/create/programmingtask task = ', task);
    log('/create/programmingtask requested by userid = ', userid);
    // you must own the course
    Mongo.ops.findOne('courses', { '_id' : new ObjectId(task.courseid) }, function(err, doc) {
        log('creating programming task, must verify doc = ', doc);
        if(err) {
            log('find err = ', err);
        } else {
            if(doc.length === 0) {
                res.status(404).send('Course not found.');
            } else {
                if(doc.userid === userid) {
                    Mongo.ops.insert('tasks', task);
                    res.status(201).send(task);
                } else {
                    res.status(403).send('Only the owner of the course can add a new programming task.');
                }
            }            
        }
    });
});

// secure web server
https.createServer(credentials, app).listen(443);

// only redirect the home page. 403 forbid all others
http.createServer(function(req, res) {
    log('catch a redirect from ' + req.headers.host + ' (is HSTS working?)');
    log('redirect req = ', req);
    log('redirect res = ', res);
    if (req.headers.host + req.url === DOMAIN + '/') {
        res.writeHead(301, { 'Location' : 'https://' + req.headers.host + req.url });
        res.end();
    } else {
        res.writeHead(403);
        res.end();
    }
}).listen(80);

log('ready to serve');