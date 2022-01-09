const express = require("express");
const socketio = require("socket.io");
const cors = require("cors");
const path = require("path");

const {
  rooms,
  users,
  nameToSocketId,
  addUser,
  removeUser,
  colors,
  nextObject,
} = require("./utility.js");

const port = process.env.PORT || 5000;
const router = require("./router");
const app = express();
app.use(cors());

// Serving Static Client
if (process.env.NODE_ENV === "production") {
  app.use(express.static("client/build"));
  app.get("*", (req, res) => {
    res.sendFile(path.resolve(__dirname, "client", "build", "index.html"));
  });
}

// Server startup
const server = app.listen(port, () =>
  console.log(`Server running on port ${port}`)
);

// Socket connection setup
const io = socketio(server, { transports: ["websocket", "polling"] });
app.use(router);

const getKeyByValue = (object, value) => {
  return Object.keys(object).find((key) => object[key] === value);
};

// Socket Operations
io.on("connection", (socket) => {
  
  console.log("connected");

  // Joining the room
  socket.on("join", ({ name, roomId, host }, cb) => {
    const errObj = addUser({ name, roomId, socketId: socket.id });
    if (host) {
      io.to(socket.id).emit("host", {});
    }
    if (errObj && errObj.error) return cb(errObj.error);
    socket.join(roomId);
    io.in(roomId).emit("members", rooms[roomId]);
  });

  // Starting the game
  socket.on("start", () => {
    let room = users[socket.id].roomId;
    colors[room] = ["blue", "red", "green", "yellow"];
    let tempNextObject = {};
    tempNextObject[nameToSocketId[rooms[room][rooms[room].length - 1]]] = nameToSocketId[rooms[room][0]];
    for (let i = 0; i < rooms[room].length; i++) {
      let tempSocketId = nameToSocketId[rooms[room][i]];
      if (i + 1 < rooms[room].length) {
        tempNextObject[tempSocketId] = nameToSocketId[rooms[room][i + 1]];
      }
      io.to(tempSocketId).emit("start", {});
      io.to(tempSocketId).emit("color", {
        myColor: colors[room].shift(),
      });
      if (i === 0) {
        io.to(tempSocketId).emit("turn", {});
      }
      io.to(tempSocketId).emit("names", rooms[room]);
      io.to(tempSocketId).emit("name", users[tempSocketId].name);
    }
    nextObject[room] = tempNextObject;
  });

  // Setting up the initial Board
  socket.on("board", (board) => {
    let room = users[socket.id].roomId;
    socket.to(room).emit("board", board);
  });

  // Notifying user for turn
  socket.on("turn", () => {
    if (users[socket.id]) {
      io.to(nextObject[users[socket.id].roomId][socket.id]).emit("turn", {});
    }
  });

  // Game Finish Notify
  socket.on("finish", () => {
    let room = users[socket.id].roomId;
    let key = getKeyByValue(nextObject[room], socket.id);
    nextObject[room][key] = nextObject[room][socket.id];
  });

  // For players chatting
  socket.on("sendMessage", (message, callback) => {
    const tempUser = users[socket.id];
    io.in(tempUser.roomId).emit("message", {
      user: tempUser.name,
      text: message,
    });
    callback();
  });

  // Disconnect and cleanup
  socket.on("disconnect", () => {
    if (users[socket.id]) {
      roomId = users[socket.id].roomId;
      if (nextObject[roomId]) {
        let key = getKeyByValue(nextObject[roomId], socket.id);
        if (nextObject[roomId][key]) {
          nextObject[roomId][key] = nextObject[roomId][socket.id];
        }
      }
      removeUser(socket.id);
      io.in(roomId).emit("members", rooms[roomId]);
      io.in(roomId).emit("names", rooms[roomId]);
    }
    console.log(rooms);
    console.log("user has left!!");
  });
});
