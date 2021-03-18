const express = require('express');
const app = express();
const fs = require('fs');
app.use(express.json());
app.use(express.static('public'));

var http = require('http').createServer(app);
var io = require('socket.io')(http);

const WHEEL_SPEED = 0.015; // radians per keypress
const LOG_FILE = 'log';
const USER_INACTIVE_TIMEOUT = 60000; // in ms
const PORT = 4000;

var users = [];
var colour_angle = 0;

function log(msg) {
    let d = new Date();
    fs.appendFile(LOG_FILE, d.toISOString() + ',' + msg + '\n', (err) => {if (err) throw err; });
}

function activeUser(u) {
    return ((u.arrow && u.arrow.timestamp >= Date.now() - USER_INACTIVE_TIMEOUT) ||
        (u.colour && u.colour.timestamp >= Date.now() - USER_INACTIVE_TIMEOUT));
}

class RateLimiter {
    constructor(queue_size, window_size) {
        this.queue = [];
        for (let i = 0; i < queue_size; i++) this.queue.push(0);
        this.window_size = window_size;
    }
    tryPush() {
        if (Date.now() < this.queue[0] + this.window_size) {
            return false;
        } else {
            this.queue.shift();
            this.queue.push(Date.now());
            return true;
        }
    }
}

io.on('connection', function(socket) {
    let user = {arrow: {}, colour: {}, name: ''};
    let ip = socket.handshake.headers["x-real-ip"];

    users.push(user);
    user.id = users.length;

    let arrowRateLimiter = new RateLimiter(3, 500);
    let colourRateLimiter = new RateLimiter(3, 500);

    function logUserEvent(msg) {
        log('user ' + user.id + '(' + user.name + ') ' + msg);
    }
    
    // init: send all users and colour.
    for (let u of users) {
        if (activeUser(u)) socket.emit('update', {user: u, now: Date.now()});
    }
    socket.emit('update', {colour_angle: colour_angle});

    socket.on('change_name', function(msg) {
        if (!msg.name || msg.name.length == 0 || msg.name.length > 10) return;
        if (users.find(u => u.name == msg.name)) return;
        logUserEvent('changed name to '+ msg.name);
        user.name = msg.name;
        io.emit('update', {user: user, now: Date.now()});
    });

    socket.on('change_arrow', function(msg) {
        if (!arrowRateLimiter.tryPush()) {
            console.log("rate limit exceeded from " + ip);
            return;
        }
        logUserEvent('change_arrow: ' + msg.dir);
        user.arrow.dir = msg.dir;
        user.arrow.timestamp = Date.now();
        io.emit('update', {user: user, now: Date.now()});
    });

    socket.on('change_colour', function(msg) {
        if (!colourRateLimiter.tryPush()) {
            console.log("rate limit exceeded from " + ip);
            return;
        }
        logUserEvent('change_colour: ' + msg.dir);
        user.colour.dir = msg.dir;
        user.colour.timestamp = Date.now();
        if (msg.dir == 'l') colour_angle -= WHEEL_SPEED;
        if (msg.dir == 'r') colour_angle += WHEEL_SPEED;
        while (colour_angle < 0)         colour_angle += 2*Math.PI;
        while (colour_angle > 2*Math.PI) colour_angle -= 2*Math.PI;
        io.emit('update', {user: user, now: Date.now(), colour_angle: colour_angle});
    });
});

http.listen(PORT, function() {
    console.log("listening on " + PORT);
});
