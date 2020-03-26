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

/**
 * Create websockify instance
 * @param {object} options
 */
module.exports = (options = {}) => {
    let Buffer = require('buffer').Buffer,
        WebSocketServer = require('ws').Server,

        webServer, wsServer,
        sourceHost, sourcePort, targetHost, targetPort,
        web_path = null,
        logEnabled = true, targetSocket;

    if(typeof options.logEnabled !== 'undefined') {
        logEnabled = options.logEnabled
    }


    /**
     * Log redefine
     */
    const log = () => {
        if(logEnabled) {
            console.log(arguments)
        }
    };

    /**
     * Handle new webSocket client
     * @param client
     * @param req
     */
    const onClientConnected = (client, req) => {
        let clientAddr = client._socket.remoteAddress, logWithClient;
        let start_time = new Date().getTime();

        log(req ? req.url : client.upgradeReq.url);
        logWithClient = function (msg) {
            log(' ' + clientAddr + ': ' + msg);
        };
        logWithClient('WebSocket connection');
        logWithClient('Version ' + client.protocolVersion + ', subprotocol: ' + client.protocol);

        let rs;
        if(options.record) {
            rs = fs.createWriteStream(options.record + '/' + new Date().toISOString().replace(/:/g, "_"));
            rs.write('var VNC_frame_data = [\n');
        } else {
            rs = null;
        }

        targetSocket = net.createConnection(targetPort, targetHost, function () {
            logWithClient('connected to target');
        });

        targetSocket.on('data', function (data) {
            //log("sending message: " + data);

            if(rs) {
                let tdelta = Math.floor(new Date().getTime()) - start_time;
                let rsdata = '\'{' + tdelta + '{' + decodeBuffer(data) + '\',\n';
                rs.write(rsdata);
            }

            try {
                client.send(data);
            } catch (e) {
                logWithClient("Client closed, cleaning up target");
                targetSocket.end();
            }
        });

        targetSocket.on('end', function () {
            logWithClient('target disconnected');
            client.close();
            if(rs) {
                rs.end('\'EOF\'];\n');
            }
        });

        targetSocket.on('error', function () {
            logWithClient('target connection error');
            targetSocket.end();
            client.close();
            if(rs) {
                rs.end('\'EOF\'];\n');
            }
        });

        client.on('message', function (msg) {
            //log('got message: ' + msg);

            if(rs) {
                let rdelta = Math.floor(new Date().getTime()) - start_time;
                let rsdata = ('\'}' + rdelta + '}' + decodeBuffer(msg) + '\',\n');
                ~rs.write(rsdata);
            }

            targetSocket.write(msg);
        });

        client.on('close', function (code, reason) {
            logWithClient('WebSocket client disconnected: ' + code + ' [' + reason + ']');
            targetSocket.end();
        });

        client.on('error', function (a) {
            logWithClient('WebSocket client error: ' + a);
            targetSocket.end();
        });
    };

    /**
     * Decode buffer method
     * @param buf
     * @return {string}
     */
    const decodeBuffer = (buf) => {
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
    };

    /**
     * Send an HTTP error response
     * @param response
     * @param code
     * @param msg
     */
    const sendHttpError = (response, code, msg) => {
        response.writeHead(code, {"Content-Type": "text/plain"});
        response.write(msg + "\n");
        response.end();
    };

    /**
     * Process an HTTP static file request
     * @param request
     * @param response
     */
    const onHttpRequest = (request, response) => {
        //    log("pathname: " + url.parse(req.url).pathname);
        //    res.writeHead(200, {'Content-Type': 'text/plain'});
        //    res.end('okay');

        if(!options.web) {
            return sendHttpError(response, 403, "403 Permission Denied");
        }

        let uri = url.parse(request.url).pathname, filename = path.join(options.web, uri);

        fs.exists(filename, function (exists) {
            if(!exists) {
                return sendHttpError(response, 404, "404 Not Found");
            }

            if(fs.statSync(filename).isDirectory()) {
                filename += '/index.html';
            }

            fs.readFile(filename, "binary", function (err, file) {
                if(err) {
                    return sendHttpError(response, 500, err);
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

// parse source and target arguments into parts
    //try {
    let source_arg = options.source;
    let target_arg = options.target;

    let idx;
    idx = source_arg.indexOf(":");
    if(idx >= 0) {
        sourceHost = source_arg.slice(0, idx);
        sourcePort = parseInt(source_arg.slice(idx + 1), 10);
    } else {
        sourceHost = "";
        sourcePort = parseInt(source_arg, 10);
    }

    idx = target_arg.indexOf(":");
    if(idx < 0) {
        throw("target must be host:port");
    }
    targetHost = target_arg.slice(0, idx);
    targetPort = parseInt(target_arg.slice(idx + 1), 10);

    if(isNaN(sourcePort) || isNaN(targetPort)) {
        throw("illegal port");
    }
    /* } catch (e) {
        *console.error("websockify.js [--web web_dir] [--cert cert.pem [--key key.pem]] [--record dir] [source_addr:]source_port target_addr:target_port");
         process.exit(2);

    }*/

    log("WebSocket settings: ");
    log("    - proxying from " + sourceHost + ":" + sourcePort +
        " to " + targetHost + ":" + targetPort);
    if(options.web) {
        log("    - Web server active. Serving: " + options.web);
    }

    //If we use predefined server
    if(options.webServer) {
        wsServer = new WebSocketServer({server: options.webServer});
        wsServer.on('connection', onClientConnected);
    } else {
        //Or create web server manually
        if(options.cert) {
            options.key = options.key || options.cert;
            let cert = fs.readFileSync(options.cert),
                key = fs.readFileSync(options.key);
            log("    - Running in encrypted HTTPS (wss://) mode using: " + options.cert + ", " + options.key);
            webServer = https.createServer({cert: cert, key: key}, onHttpRequest);
        } else {
            log("    - Running in unencrypted HTTP (ws://) mode");
            webServer = http.createServer(onHttpRequest);
        }
        webServer.listen(sourcePort, function () {
            wsServer = new WebSocketServer({server: webServer});
            wsServer.on('connection', onClientConnected);
        });
    }

    /**
     * Terminates websockify
     */
    const terminate = () => {
        log('Websockify terminate');
        if(!options.webServer) {
            webServer.close;
        }
        wsServer.close();
    };

    return {
        wsServer: wsServer,
        webServer: webServer,
        log: log,
        options: options,
        targetSocket,
        terminate
    }
};
