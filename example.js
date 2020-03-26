/**
 *   node-websockify example
 *   @author Andrey Nedobylsky (admin@twister-vl.ru)
 */


const Websockify = require('.');

(async () => {

    //Create websockify instance
    let wsockify = new Websockify(
        {
            source: 'localhost:5901', //WebSocket server binding address
            target: 'localhost:5900', //Proxying TCP port
            path: '/test',            //Websocket subpath (DONT FORGET SLASH)
            //logEnabled: false,      //Disable logging
        }
    );

    //Start websockify instance
    await wsockify.start();

    //Some stuff...

    //Stops websockify instance
    //await wsockify.stop();

})();