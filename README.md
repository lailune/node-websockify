## node-websockify: NodeJS module version of websockify-js

[Original version of websockify-js you can found here](https://github.com/novnc/websockify-js).

websockify was formerly named wsproxy and was part of the
[noVNC](https://github.com/kanaka/noVNC) project.

At the most basic level, websockify just translates WebSockets traffic
to normal socket traffic. Websockify accepts the WebSockets handshake,
parses it, and then begins forwarding traffic between the client and
the target in both directions.

To use node-websockify:

    npm install node-websockify
    
```javascript
const Websockify = require('.');

(async () => {

    //Create websockify instance
    let wsockify = new Websockify(
        {
            source: 'localhost:5901', //WebSocket server binding address
            target: 'localhost:5900', //Proxying TCP port
            //logEnabled: false,      //Disable logging
        }
    );

    //Start websockify instance
    await wsockify.start();

    //Some stuff...

    //Stops websockify instance
    await wsockify.stop();

})();
```

### News/help/contact


Bugs and feature requests can be submitted via [github
issues](https://github.com/lailune/node-websockify/issues).

