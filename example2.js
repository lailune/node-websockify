/**
 *   node-websockify example
 *   @author Andrey Nedobylsky (admin@twister-vl.ru)
 */

//Multiple websockify instance

const Websockify = require('.');

const http = require('http');
let webServer = http.createServer();
webServer.listen(5901);

(async () => {

    let wsockify1 = new Websockify(
        {
            webServer,
            target: 'localhost:5900',
            path: '/socket1',
        }
    );
    let wsockify2 = new Websockify(
        {
            webServer,
            target: 'localhost:5900',
            path: '/socket2',
        }
    );

    await wsockify1.start();
    await wsockify2.start();

})();