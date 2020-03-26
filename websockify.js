/**
 * node-websockify - NodeJS module version of websockify-js
 * @author Andrey Nedobylsky (admin@twister-vl.ru)
 */

//Original titiles:
// A WebSocket to TCP socket proxy
// Copyright 2012 Joel Martin
// Licensed under LGPL version 3 (see docs/LICENSE.LGPL-3)

// Known to work with node 0.8.9
// Requires node modules: ws and optimist
//     npm install ws optimist


const
    net = require('net'),
    http = require('http'),
    https = require('https'),
    url = require('url'),
    path = require('path'),
    fs = require('fs'),
    mime = require('mime-types');

const Buffer = require('buffer').Buffer;
const WebSocketServer = require('ws').Server;

/**
 * Create websockify instance
 * WARNING:
 * source - WebSocket server binding address
 * target - proxying TCP port
 * @param {object} options
 */

class Websockify {
    constructor(options = {}) {
        this.options = options;

        this.webServer = null;
        this.wsServer = null;
        this.targetSocket = null;

        this._sourceHost = null;
        this._sourcePort = null;
        this._targetHost = null;
        this._targetPort = null;

        this.logEnabled = true;

        if(typeof options.logEnabled !== 'undefined') {
            this.logEnabled = options.logEnabled
        }


// parse source and target arguments into parts
        //try {
        if((!this.options.source || !this.options.target) && !this.options.webServer) {
            throw new Error('No source or target specified');
        }
        let sourceArg = this.options.source;
        let targetArg = this.options.target;

        let idx;
        if(!this.options.webServer) {
            idx = sourceArg.indexOf(":");
            if(idx >= 0) {
                this._sourceHost = sourceArg.slice(0, idx);
                this._sourcePort = parseInt(sourceArg.slice(idx + 1), 10);
            } else {
                this._sourceHost = "";
                this._sourcePort = parseInt(sourceArg, 10);
            }
        }

        idx = targetArg.indexOf(":");
        if(idx < 0) {
            throw("target must be host:port");
        }
        this._targetHost = targetArg.slice(0, idx);
        this._targetPort = parseInt(targetArg.slice(idx + 1), 10);

        if(isNaN(this._sourcePort) || isNaN(this._targetPort)) {
            throw("illegal port");
        }
        /* } catch (e) {
            *console.error("websockify.js [--web web_dir] [--cert cert.pem [--key key.pem]] [--record dir] [source_addr:]source_port target_addr:target_port");
             process.exit(2);

        }*/

    }

    /**
     * Starts web socket server
     * @async
     */
    start() {
        const that = this;
        return new Promise((resolve, reject) => {
            that.log("WebSocket settings: ");
            if(!that.options.webServer) {
                that.log("    - proxying from " + that._sourceHost + ":" + that._sourcePort +
                    " to " + that._targetHost + ":" + that._targetPort);
                if(that.options.web) {
                    that.log("    - Web server active. Serving: " + that.options.web);
                }
            } else {
                that.log("    - proxying from custom web server" +
                    " to " + that._targetHost + ":" + that._targetPort);
            }

            //If we use predefined server
            if(that.options.webServer) {
                that.wsServer = new WebSocketServer({noServer: true, path: that.options.path});

                that.options.webServer.on('upgrade', function upgrade(request, socket, head) {
                    const pathname = url.parse(request.url).pathname;
                    if(pathname === that.options.path || !that.options.path) {
                        that.wsServer.handleUpgrade(request, socket, head, function done(ws) {
                            that.wsServer.emit('connection', ws, request);
                        });
                    }
                });

                that.wsServer.on('connection', (client, req) => {
                    that.onClientConnected(client, req);
                });

                return resolve();
            }
            //Or create web server manually

            if(that.options.cert) {
                that.options.key = that.options.key || that.options.cert;
                let cert = fs.readFileSync(that.options.cert),
                    key = fs.readFileSync(that.options.key);
                that.log("    - Running in encrypted HTTPS (wss://) mode using: " + that.options.cert + ", " + that.options.key);
                that.webServer = https.createServer({cert: cert, key: key}, (request, response) => {
                    that.onHttpRequest(request, response);
                });
            } else {
                that.log("    - Running in unencrypted HTTP (ws://) mode");
                that.webServer = http.createServer((request, response) => {
                    that.onHttpRequest(request, response);
                });
            }

            that.webServer.listen(that._sourcePort, function (err) {
                if(err) {
                    return reject(err);
                }

                that.wsServer = new WebSocketServer({server: that.webServer, path: that.options.path});
                that.wsServer.on('connection', (client, req) => {
                    that.onClientConnected(client, req);
                });
                return resolve();
            });

        });
    }

    /**
     * Terminates websockify
     */
    async terminate() {
        this.log('Websockify terminate');
        if(!this.options.webServer) {
            this.webServer.close();
        }
        this.wsServer.close();
    };

    /**
     * Log redefine
     */
    log() {
        if(this.logEnabled) {
            console.log(...arguments);
        }
    }

    /**
     * Handle new webSocket client
     * @param client
     * @param req
     */
    onClientConnected(client, req) {
        const that = this;
        let clientAddr = client._socket.remoteAddress, logWithClient;
        let start_time = new Date().getTime();

        this.log(req ? req.url : client.upgradeReq.url);

        logWithClient = function (msg) {
            that.log(' ' + clientAddr + ': ' + msg);
        };

        logWithClient('WebSocket connection');
        logWithClient('Version ' + client.protocolVersion + ', subprotocol: ' + client.protocol);

        let rs;
        if(this.options.record) {
            rs = fs.createWriteStream(this.options.record + '/' + new Date().toISOString().replace(/:/g, "_"));
            rs.write('var VNC_frame_data = [\n');
        } else {
            rs = null;
        }

        this.targetSocket = net.createConnection(this._targetPort, this._targetHost, function () {
            logWithClient('connected to target');
        });

        this.targetSocket.on('data', function (data) {
            //log("sending message: " + data);

            if(rs) {
                let tdelta = Math.floor(new Date().getTime()) - start_time;
                let rsdata = '\'{' + tdelta + '{' + that.decodeBuffer(data) + '\',\n';
                rs.write(rsdata);
            }

            try {
                client.send(data);
            } catch (e) {
                logWithClient("Client closed, cleaning up target");
                that.targetSocket.end();
            }
        });

        this.targetSocket.on('end', function () {
            logWithClient('target disconnected');
            client.close();
            if(rs) {
                rs.end('\'EOF\'];\n');
            }
        });

        this.targetSocket.on('error', function () {
            logWithClient('target connection error');
            that.targetSocket.end();
            client.close();
            if(rs) {
                rs.end('\'EOF\'];\n');
            }
        });

        client.on('message', function (msg) {
            //log('got message: ' + msg);

            if(rs) {
                let rdelta = Math.floor(new Date().getTime()) - start_time;
                let rsdata = ('\'}' + rdelta + '}' + that.decodeBuffer(msg) + '\',\n');
                ~rs.write(rsdata);
            }

            that.targetSocket.write(msg);
        });

        client.on('close', function (code, reason) {
            logWithClient('WebSocket client disconnected: ' + code + ' [' + reason + ']');
            that.targetSocket.end();
        });

        client.on('error', function (a) {
            logWithClient('WebSocket client error: ' + a);
            that.targetSocket.end();
        });
    }

    /**
     * Decode buffer method
     * @param buf
     * @return {string}
     */

    decodeBuffer(buf) {
        let returnString = '';
        for (let i = 0; i < buf.length; i++) {
            if(buf[i] >= 48 && buf[i] <= 90) {
                returnString += String.fromCharCode(buf[i]);
            } else if(buf[i] === 95) {
                returnString += String.fromCharCode(buf[i]);
            } else if(buf[i] >= 97 && buf[i] <= 122) {
                returnString += String.fromCharCode(buf[i]);
            } else {
                let charToConvert = buf[i].toString(16);
                if(charToConvert.length === 0) {
                    returnString += '\\x00';
                } else if(charToConvert.length === 1) {
                    returnString += '\\x0' + charToConvert;
                } else {
                    returnString += '\\x' + charToConvert;
                }
            }
        }
        return returnString;
    }

    /**
     * Send an HTTP error response
     * @param response
     * @param code
     * @param msg
     */
    sendHttpError(response, code, msg) {
        response.writeHead(code, {"Content-Type": "text/plain"});
        response.write(msg + "\n");
        response.end();
    };


    /**
     * Process an HTTP static file request
     * @param request
     * @param response
     */
    onHttpRequest(request, response) {
        const that = this;
        //    log("pathname: " + url.parse(req.url).pathname);
        //    res.writeHead(200, {'Content-Type': 'text/plain'});
        //    res.end('okay');

        if(!this.options.web) {
            return this.sendHttpError(response, 403, "403 Permission Denied");
        }

        let uri = url.parse(request.url).pathname, filename = path.join(this.options.web, uri);

        fs.exists(filename, function (exists) {
            if(!exists) {
                return that.sendHttpError(response, 404, "404 Not Found");
            }

            if(fs.statSync(filename).isDirectory()) {
                filename += '/index.html';
            }

            fs.readFile(filename, "binary", function (err, file) {
                if(err) {
                    return that.sendHttpError(response, 500, err);
                }

                let headers = {};
                let contentType = mime.contentType(path.extname(filename));
                if(contentType !== false) {
                    headers['Content-Type'] = contentType;
                }

                response.writeHead(200, headers);
                response.write(file, "binary");
                response.end();
            });
        });
    };

}

module.exports = Websockify;