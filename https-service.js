//==============================================================================
// Exports the HttpsService class that sends HTTPS requests to a server.
//==============================================================================
// Copyright (c) 2016 Frank Hellwig
//==============================================================================

'use strict';

//------------------------------------------------------------------------------
// Dependencies
//------------------------------------------------------------------------------

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var https = require('https');
var HttpsError = require('https-error-legacy');
var url = require('url');
var util = require('util');
var querystring = require('querystring');

//------------------------------------------------------------------------------
// Initialization
//------------------------------------------------------------------------------

var JSON_MEDIA_TYPE = 'application/json';
var FORM_MEDIA_TYPE = 'application/x-www-form-urlencoded';

var CONTENT_TYPE_HEADER = 'content-type';
var CONTENT_LENGTH_HEADER = 'content-length';

var slice = Array.prototype.slice;

//------------------------------------------------------------------------------
// Private
//------------------------------------------------------------------------------

function httpsError(code, opt, msg) {
    msg = '[' + opt.method + ' https://' + opt.host + ':' + opt.port + opt.path + '] ' + msg;
    return new HttpsError(code, msg);
}

function appendQuery(path, query) {
    if (util.isObject(query)) {
        query = querystring.stringify(query);
    }
    if (util.isString(query)) {
        var sep = path.indexOf('?') < 0 ? '?' : '&';
        return path + sep + query;
    }
    return path;
}

function headerValue(headers, name) {
    if (util.isObject(headers)) {
        var keys = Object.keys(headers);
        for (var i = 0, n = keys.length; i < n; i++) {
            var key = keys[i];
            if (key.toLowerCase() === name) {
                return headers[key];
            }
        }
    }
    return null;
}

function removeParams(value) {
    if (value) {
        var semi = value.indexOf(';');
        if (semi > 0) {
            return value.substring(0, semi);
        }
    }
    return value;
}

//------------------------------------------------------------------------------
// Public
//------------------------------------------------------------------------------

var HttpsService = function () {

    /**
     * Accepts a hostname (example.com) or a URI (https://example.com:443).
     */
    function HttpsService(uri) {
        _classCallCheck(this, HttpsService);

        var parsed = url.parse(uri);
        if (parsed.protocol === null) {
            parsed.hostname = parsed.pathname;
        } else if (parsed.protocol !== 'https:') {
            throw new URIError(uri + ': invalid protocol (expected https)');
        }
        this.host = parsed.hostname;
        this.port = parsed.port || 443;
    }

    // get(path, [query,] callback)
    // callback(err, body, type);


    _createClass(HttpsService, [{
        key: 'get',
        value: function get(path, query, callback) {
            if (typeof query === 'function') {
                callback = query;
                query = null;
            } else {
                path = appendQuery(path, query);
            }
            this.request('GET', path, null, null, callback);
        }
    }, {
        key: 'head',
        value: function head(path, query, callback) {
            if (typeof query === 'function') {
                callback = query;
                query = null;
            } else {
                path = appendQuery(path, query);
            }
            this.request('HEAD', path, null, null, callback);
        }
    }, {
        key: 'post',
        value: function post(path, data, callback) {
            this.request('POST', path, null, data, callback);
        }
    }, {
        key: 'put',
        value: function put(path, data, callback) {
            this.request('PUT', path, null, data, callback);
        }
    }, {
        key: 'patch',
        value: function patch(path, data, callback) {
            this.request('PATCH', path, null, data, callback);
        }
    }, {
        key: 'delete',
        value: function _delete(path, callback) {
            this.request('DELETE', path, null, null, callback);
        }
    }, {
        key: 'request',
        value: function request(method, path, headers, data, callback) {
            method = method.toUpperCase();
            headers = headers || {};
            if (data !== null) {
                if (util.isObject(data) && !Buffer.isBuffer(data)) {
                    var type = headerValue(headers, CONTENT_TYPE_HEADER);
                    switch (type) {
                        case JSON_MEDIA_TYPE:
                            data = JSON.stringify(data);
                            break;
                        case FORM_MEDIA_TYPE:
                            data = querystring.stringify(data);
                            break;
                        case null:
                            headers[CONTENT_TYPE_HEADER] = JSON_MEDIA_TYPE;
                            data = JSON.stringify(data);
                            break;
                        default:
                            throw new Error('Unsuported media type (cannot serialize object): ' + type);
                    }
                }
                if (util.isString(data) && headerValue(headers, CONTENT_LENGTH_HEADER) === null) {
                    headers[CONTENT_LENGTH_HEADER] = Buffer.byteLength(data);
                }
            }
            var options = {
                method: method,
                host: this.host,
                port: this.port,
                path: path,
                headers: headers
            };
            var chunks = [];
            var request = https.request(options, function (response) {
                response.on('data', function (chunk) {
                    chunks.push(chunk);
                });
                response.on('end', function (_) {
                    if (response.statusCode === 204) {
                        return callback(null, null, null, response.headers);
                    }
                    var code = response.statusCode;
                    var type = removeParams(headerValue(response.headers, CONTENT_TYPE_HEADER));
                    var body = Buffer.concat(chunks);
                    if (method === 'HEAD') {
                        body = null;
                    } else if (type === 'application/json') {
                        body = body.toString();
                        if (!body) {
                            return callback(httpsError(502, options, 'Empty Response'));
                        }
                        try {
                            body = JSON.parse(body);
                        } catch (e) {
                            return callback(httpsError(502, options, e.message));
                        }
                        // Sometimes Microsoft returns an error description.
                        if (body.error_description) {
                            var message = body.error_description.split(/\r?\n/)[0];
                            return callback(httpsError(code, options, message));
                        }
                        // Other times Microsoft returns an error object.
                        if (body.error && body.error.message) {
                            return callback(httpsError(code, options, body.error.message));
                        }
                        // It could be an odata error.
                        if (body['odata.error'] && body['odata.error'].message) {
                            return callback(httpsError(code, options, body['odata.error'].message.value));
                        }
                    } else if (type.startsWith('text/') || type.endsWith('+xml')) {
                        body = body.toString();
                    }
                    var success = code === 200 || code === 201;
                    if (!success) {
                        return callback(httpsError(response.statusCode, options, 'The request was not successfully completed.'));
                    }
                    callback(null, body, type, response.headers);
                });
            });
            request.on('error', function (err) {
                callback(err);
            });
            if (data !== null) {
                if (util.isString(data) || Buffer.isBuffer(data)) {
                    request.write(data);
                } else {
                    throw new Error('Invalid request data (must be string or Buffer): ' + (typeof data === 'undefined' ? 'undefined' : _typeof(data)));
                }
            }
            request.end();
        }
    }]);

    return HttpsService;
}();

HttpsService.JSON_MEDIA_TYPE = JSON_MEDIA_TYPE;
HttpsService.FORM_MEDIA_TYPE = FORM_MEDIA_TYPE;

//------------------------------------------------------------------------------
// Exports
//------------------------------------------------------------------------------

module.exports = HttpsService;