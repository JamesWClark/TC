var express = require('express');
var api = express();
var bodyParser = require('body-parser');


var assert = require('assert');
var moment = require('moment');
var Mongo = require('mongodb').MongoClient;

var dburl = 'mongodb://localhost:27017/teachcode';

var ACCESS_CONTROL_ALLOW_ORIGIN = 'https://local.info';
var ACCESS_CONTROL_ALLOW_METHODS = 'GET,PUT,POST,DELETE';
var ACCESS_CONTROL_ALLOW_HEADERS = 'Content-Type';

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

var allowCrossDomain = function(req, res, next) {
    res.header('Access-Control-Allow-Origin', ACCESS_CONTROL_ALLOW_ORIGIN);
    res.header('Access-Control-Allow-Methods', ACCESS_CONTROL_ALLOW_METHODS);
    res.header('Access-Control-Allow-Headers', ACCESS_CONTROL_ALLOW_HEADERS);
    next();
};

api.use(allowCrossDomain);

api.use(bodyParser.json());
api.use(bodyParser.urlencoded({ extended: false }));

api.use('/user/:id',
        
    function(req, res, next) {
      console.log('Request URL:', req.originalUrl);
      next();
    }, 
        
    function (req, res, next) {
      console.log('Request Type:', req.method);
      next();
    }
);

api.post('/signin', function(req, res) {
    log('post: /signin = ', data);
    
    var data = req.body;
    data.timestamp = moment().format('x');
    data.ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    
    Mongo.ops.insertJson('logins', data);
    res.status(201).send('');
});

exports.app = api;