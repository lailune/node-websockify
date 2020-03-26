## node-websockify: NodeJS module version of websockify-js

[Original version of websockify-js you can found here](https://github.com/novnc/websockify-js).

websockify was formerly named wsproxy and was part of the
[noVNC](https://github.com/kanaka/noVNC) project.

At the most basic level, websockify just translates WebSockets traffic
to normal socket traffic. Websockify accepts the WebSockets handshake,
parses it, and then begins forwarding traffic between the client and
the target in both directions.

Note that this is the JavaScript version of websockify. The primary
project is the [Python version of
websockify](https://github.com/novnc/websockify).

To run websockify-js:

    cd websockify
    npm install
    ./websockify.js [options] SOURCE_ADDR:PORT TARGET_ADDR:PORT

### News/help/contact


Bugs and feature requests can be submitted via [github
issues](https://github.com/lailune/node-websockify/issues).

