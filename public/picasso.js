const DECAY_LENGTH = 3000;

var socket = io();
var users = {};
var time_offset = 0;
var colour_angle = null;
var target_colour_angle = 0;
var last_user_press_dir = null;
var last_user_press_ts = null;

function decay(val, ms_since) {
    return val * (1.0 - (ms_since / DECAY_LENGTH));
}

const COLOUR_ANGLE_SPEED = 0.005; // radians per 100ms
function updateColourAngle() {
  if (colour_angle == null) return;
  let delta = target_colour_angle - colour_angle;
  if (delta < 0) delta += 2*Math.PI;
  if (delta < COLOUR_ANGLE_SPEED || (2*Math.PI - delta) < COLOUR_ANGLE_SPEED) {
    colour_angle = target_colour_angle;
  } else {
    if (delta < Math.PI) colour_angle += COLOUR_ANGLE_SPEED;
    else colour_angle -= COLOUR_ANGLE_SPEED;
  }
  while (colour_angle < 0) colour_angle += 2*Math.PI;
  while (colour_angle >= 2*Math.PI) colour_angle -= 2*Math.PI;
}

function canvas_arrow(context, fromx, fromy, tox, toy) {
    let headlen = 10; // length of head in pixels
    let dx = tox - fromx;
    let dy = toy - fromy;
    let angle = Math.atan2(dy, dx);
    context.moveTo(fromx, fromy);
    context.lineTo(tox, toy);
    if (dx * dx + dy*dy > 25) {
      context.lineTo(tox - headlen * Math.cos(angle - Math.PI / 6), toy - headlen * Math.sin(angle - Math.PI / 6));
      context.moveTo(tox, toy);
      context.lineTo(tox - headlen * Math.cos(angle + Math.PI / 6), toy - headlen * Math.sin(angle + Math.PI / 6));
    }
}

function draw_arrow(x, y, myx, myy) {
  let w = $("#canvasDiv").width();
  const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
  const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
  w = Math.min(w, vh - 250);

  let ctx = document.getElementById("canvas").getContext("2d");
  ctx.canvas.width = w;
  ctx.canvas.height = w;
  let radius = w / 2;
  let cx = radius + 1, cy = radius + 1;
  x = Math.floor(cx + (radius-5)*x);
  y = Math.floor(cy - (radius-5)*y); // in canvas (0,0) is top-left.
  ctx.clearRect(0,0,ctx.canvas.width, ctx.canvas.height);
  ctx.fillRect(cx, cy, 1, 1);
  ctx.beginPath();
  ctx.arc(cx, cy, radius-2, 0, 2 * Math.PI);
  ctx.stroke()
  ctx.beginPath();
  if (x != cx || y != cy) canvas_arrow(ctx, cx, cy, x, y);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.strokeStyle = '#888888';
  ctx.lineWidth = 2;
  myx = Math.floor(cx + (radius-5)*myx);
  myy = Math.floor(cy - (radius-5)*myy);
  if (myx != cx || myy != cy) canvas_arrow(ctx, cx, cy, myx, myy);
  ctx.stroke();
}

const COLOUR_PICKER_LENGTH = 90;
function draw_colour(angle) {
    let ctx = document.getElementById("wheel").getContext("2d");
    let image = document.getElementById('wheel-image');
    let cx = ctx.canvas.width / 2, cy = ctx.canvas.height / 2;
    let x = cx + Math.cos(angle) * COLOUR_PICKER_LENGTH;
    let y = cy + Math.sin(angle) * COLOUR_PICKER_LENGTH;
    
    ctx.fillRect(0,0,ctx.canvas.width, ctx.canvas.height);
//        ctx.arc(cx, cy, cx + 20, 0, 2*Math.PI);
//        ctx.fill();
    ctx.drawImage(image, 0, 0);
    let pixel = ctx.getImageData(x, y , 1, 1).data;
    let rgbHex = ((pixel[0] << 16) | (pixel[1] << 8) | pixel[2]).toString(16);
    $("#pickedColour").css("background-color", "#" + rgbHex);

    ctx.beginPath();
    canvas_arrow(ctx, cx, cy, Math.floor(x), Math.floor(y));
    ctx.stroke();
}

function squash(x) {
  return Math.tanh(x);
//      return 1 / (1 + Math.pow(Math.E, -x));
}

function renderArrow() {
    let score = {'u': 0, 'd': 0, 'l': 0, 'r': 0};
    let dirvec = {'u': [0, 1], 'd': [0, -1], 'l': [-1, 0], 'r': [1, 0]};
    let x = 0, y = 0;
    let total = 0;
    for (let uid in users) {
        let user_event = users[uid]['arrow'];
        if (!user_event) continue;
        let ms_since = Date.now() + time_offset - (user_event.timestamp || 0);
        if (ms_since < DECAY_LENGTH) {
            let mag = decay(1.0, ms_since); // in (0,1)
            x += dirvec[user_event.dir][0] * mag;
            y += dirvec[user_event.dir][1] * mag;
            score[user_event.dir] += 1;
            total += mag;
        }
    }
    for (let dir in score) {
      $("#num-" + dir).html(score[dir]);
    }
    /*
    // OPTION 1: Weighted average of user vectors.
    if (total > 0) {
        x /= total;
        y /= total;
    }
    */
   // OPTION 2: Sum of user vectors, squashed to [0,1].
   let length = Math.sqrt(x*x + y*y);
   let squashed_length = squash(Math.sqrt(x*x + y*y));
   if (squashed_length != 0) {
     let scale = squashed_length / length;
     x *= scale;
     y *= scale;
   }
   // User's arrow.
   let myx = 0, myy = 0;
   if (last_user_press_dir) {
      let ms = Date.now() - last_user_press_ts;
      if (ms < DECAY_LENGTH) {
        myx = squash(dirvec[last_user_press_dir][0] * decay(1.0, ms));
        myy = squash(dirvec[last_user_press_dir][1] * decay(1.0, ms));
      }
   }
    draw_arrow(x, y, myx, myy);
}

socket.on('update', function(msg) {
    if (msg.user) {
        users[msg.user.id] = msg.user;
        console.log("Updating user: " + JSON.stringify(msg.user));
    }
    if (msg.now) {
        time_offset = msg.now - Date.now();
    }
    if (msg.colour_angle) {
        target_colour_angle = msg.colour_angle;
        if (colour_angle == null) colour_angle = target_colour_angle;
    }
//        renderArrow();
//       draw_colour(colour_angle);
});

class RateLimiter {
    constructor(queue_size, window_size) {
        this.queue = [];
        for (let i = 0; i < queue_size; i++) this.queue.push(0);
        this.window_size = window_size;
    }
    tryPush() {
        if (Date.now() < this.queue[0] + this.window_size) {
            console.log("exceeded rate limit. wait " + (this.queue[0] + this.window_size - Date.now())/1000 + "s");
            return false;
        } else {
            this.queue.shift();
            this.queue.push(Date.now());
            return true;
        }
    }
}
arrowRateLimiter = new RateLimiter(3, 500);
colourRateLimiter = new RateLimiter(3, 500);
function tryChangeDir(dir) {
    if (arrowRateLimiter.tryPush()) {
        last_user_press_dir = dir;
      last_user_press_ts = Date.now();
        socket.emit('change_arrow', {dir: dir});
    }
}
function tryChangeColour(dir) {
  if (dir !='l' && dir != 'r') return;
    if (arrowRateLimiter.tryPush()) {
        socket.emit('change_colour', {dir: dir});
    }
}

document.onkeydown = function(e) {
    let keymap = {37: 'l', 38: 'u', 39: 'r', 40: 'd'};
    if (e.which in keymap) {
        if (e.shiftKey) tryChangeColour(keymap[e.which]);
        else tryChangeDir(keymap[e.which]);
        e.preventDefault();
    }
}

function updateNews() {
  const dirstr = {'u': 'up', 'd': 'down', 'l': 'left', 'r': 'right'};
  const colourstr = {'l': 'counter-clockwise', 'r': 'clockwise'};
  // get last 5 events.
  events = [];
  for (let uid in users) {
    if (users[uid].arrow.timestamp) {
      events.push({time: users[uid].arrow.timestamp, type: 'arrow', uid: uid});
    }
    if (users[uid].colour.timestamp) {
      events.push({time: users[uid].colour.timestamp, type: 'colour', uid: uid});
    }
  }
  events.sort((a, b) => b.time - a.time);
  let str = '';
  for (let i = 0; i < Math.min(events.length, 5); i++) {
    let uid = events[i].uid;
    if (events[i].type == 'arrow') {
      str += '<b>' + users[uid].name + '</b> wants to go <b>' + dirstr[users[uid].arrow.dir] + '</b><br>';
    } else {
      str += '<b>' + users[uid].name + '</b> shifted colour <b>' + colourstr[users[uid].colour.dir] + '</b><br>';
    }
  }
  $("#newsDiv").html(str);
}

var name = "Random" + (Math.floor(Math.random() * 899) + 100);
function nameExists(new_name) {
  for (let uid in users) if (users[uid].name == new_name) return true;
  return false;
}
$(function() {
    $("#username").val(name);
    socket.emit("change_name", {name: name});

    $("#changeNameButton").click(function() {
      let new_name = $("#username").val();
      if (new_name.length > 0 && new_name.length <= 10 && !nameExists(new_name)) {
        name = new_name;
        socket.emit('change_name', {name: name});
        console.log("Changing name " + name);
      } else {
        alert('Name must be less than 10 characters and unique.');
        $("#username").val(name);
      }
    });
    $("#colorRight").click(function() {
        tryChangeColour('r');
    });
    $("#colorLeft").click(function() {
        tryChangeColour('l');
    });
    $("#directionLeft").click(function() {
        tryChangeDir('l');
    });
    $("#directionRight").click(function() {
        tryChangeDir('r');
    });
    $("#directionUp").click(function() {
        tryChangeDir('u');
    });
    $("#directionDown").click(function() {
        tryChangeDir('d');
    });
    setInterval(function() {
        renderArrow();
        updateColourAngle();
        draw_colour(colour_angle);
        updateNews();
      },100);
});
