const http = require("http");
const socketIo = require("socket.io");

const server = http.createServer();
const io = socketIo(server);

const users = new Map(); //mapping usernames to their public key and socket information.

io.on("connection", (socket) => {
  console.log(`Client ${socket.id} connected`);

  //to send the current user list to the newly connected client
  socket.emit(
    "init",
    Array.from(users.entries()).map(([username, { publicKey }]) => [username, publicKey])
  );

  //Register user's public key
  socket.on("registerPublicKey", (data) => {
    const { username, publicKey } = data; //Extract payload (usn & publickey)
    users.set(username, { publicKey, socketId: socket.id }); //Stored the payload in users
    console.log(`${username} registered with public key.`);

    //Broadcast to all clients about the new user (exc. client who triggered the event)
    socket.broadcast.emit("newUser", { username, publicKey });
  });

  //Broadcast public msg (excluding sender)
  socket.on("message", (data) => {
    const { username, message } = data;
    console.log(`Public message from ${username}: ${message}`);

    //Broadcast the msg to all clients (excluding sender)
    socket.broadcast.emit("message", { username, message });
  });

  socket.on("privateMessage", (data) => {
    const { username, message, targetUsername, encrypted } = data;
    const targetUser = users.get(targetUsername);
  
    if (targetUser) {
      console.log(`Private message from ${username} to ${targetUsername}`);
  
      //Send private msg only to the target user's socket
      io.to(targetUser.socketId).emit("privateMessage", {username, //Sender's username
        targetUsername,
        message, //Encrypted message for decryption by recipient
        encrypted: true,
      });
  
      //Send encrypted message to all other users
      for (const [user, { socketId }] of users.entries()) {
        if (socketId !== socket.id && socketId !== targetUser.socketId) {
          io.to(socketId).emit("message", {
            username, 
            message, 
            encrypted: true,
          });
        }
      }
    } else {
      console.log(`Private message failed: ${targetUsername} not found.`);
    }
  });
  

  //Handle client disconnect
  socket.on("disconnect", () => {
    const disconnectedUser = Array.from(users.entries()).find(
      ([, userData]) => userData.socketId === socket.id
    );

    if (disconnectedUser) {
      const [username] = disconnectedUser;
      users.delete(username);
      io.emit("userLeft", username);
      console.log(`${username} disconnected.`);
    }
  });
});

//Start server
const port = 3000;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

