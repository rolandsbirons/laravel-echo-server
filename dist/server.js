"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var express = require('express');
var fs = require('fs');
var http = require('http');
var https = require('https');
var io = require('socket.io');
var RandExp = require('randexp');
var url = require('url');
var log_1 = require("./log");
var Server = (function () {
    function Server(options) {
        this.options = options;
    }
    Server.prototype.init = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            _this.serverProtocol().then(function () {
                var host = _this.options.host || 'localhost';
                log_1.Log.success("Running at " + host + " on port " + _this.getPort());
                resolve(_this.io);
                _this.io.eio.generateId = function () {
                    var socketIdSpec = _this.options.socketIdSpec || '([a-zA-Z0-9]{15})';
                    return new RandExp(socketIdSpec);
                };
            }, function (error) { return reject(error); });
        });
    };
    Server.prototype.getPort = function () {
        var portRegex = /([0-9]{2,5})[\/]?$/;
        var portToUse = String(this.options.port).match(portRegex);
        return Number(portToUse[1]);
    };
    Server.prototype.serverProtocol = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            if (_this.options.protocol == 'https') {
                _this.secure().then(function () {
                    resolve(_this.httpServer(true));
                }, function (error) { return reject(error); });
            }
            else {
                resolve(_this.httpServer(false));
            }
        });
    };
    Server.prototype.secure = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            if (!_this.options.sslCertPath || !_this.options.sslKeyPath) {
                reject('SSL paths are missing in server config.');
            }
            Object.assign(_this.options, {
                cert: fs.readFileSync(_this.options.sslCertPath),
                key: fs.readFileSync(_this.options.sslKeyPath),
                ca: (_this.options.sslCertChainPath) ? fs.readFileSync(_this.options.sslCertChainPath) : '',
                passphrase: _this.options.sslPassphrase,
            });
            resolve(_this.options);
        });
    };
    Server.prototype.httpServer = function (secure) {
        var _this = this;
        this.express = express();
        this.express.use(function (req, res, next) {
            for (var header in _this.options.headers) {
                res.setHeader(header, _this.options.headers[header]);
            }
            next();
        });
        if (secure) {
            var httpServer = https.createServer(this.options, this.express);
        }
        else {
            var httpServer = http.createServer(this.express);
        }
        httpServer.listen(this.getPort(), this.options.host);
        this.authorizeRequests();
        return this.io = io(httpServer, this.options.socketio);
    };
    Server.prototype.authorizeRequests = function () {
        var _this = this;
        this.express.param('appId', function (req, res, next) {
            if (!_this.canAccess(req)) {
                return _this.unauthorizedResponse(req, res);
            }
            next();
        });
    };
    Server.prototype.canAccess = function (req) {
        var appId = this.getAppId(req);
        var key = this.getAuthKey(req);
        if (key && appId) {
            var client = this.options.clients.find(function (client) {
                return client.appId === appId;
            });
            if (client) {
                return client.key === key;
            }
        }
        return false;
    };
    Server.prototype.getAppId = function (req) {
        if (req.params.appId) {
            return req.params.appId;
        }
        return false;
    };
    Server.prototype.getAuthKey = function (req) {
        if (req.headers.authorization) {
            return req.headers.authorization.replace('Bearer ', '');
        }
        if (url.parse(req.url, true).query.auth_key) {
            return url.parse(req.url, true).query.auth_key;
        }
        return false;
    };
    Server.prototype.unauthorizedResponse = function (req, res) {
        res.statusCode = 403;
        res.json({ error: 'Unauthorized' });
        return false;
    };
    return Server;
}());
exports.Server = Server;
