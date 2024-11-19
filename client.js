const io = require("socket.io-client");
const readline = require("readline");
const crypto = require("crypto");

const socket = io("http://localhost:3000");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

let username = "";
let targetUsername = "";
const users = new Map();

//Public and private Key gen for client
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

//Connection sec.
socket.on("connect", () => {
  console.log("Connected to the server");

  rl.question("Enter your username: ", (input) => {
    //Trimming to avoid blank or white spaces
    username = input.trim();
    //Validation for those client who don't fill usn, then terminate
    if (!username) {
      console.log("Username can't be empty! Exiting..");
      process.exit(0);
    }

    console.log(`Welcome, ${username} to the chat`);

    //send registered usn and public key to the server
    socket.emit("registerPublicKey", { username, publicKey });
    rl.prompt();

    //Input sec.
    rl.on("line", (message) => {
      if (message.trim()) {
        //Start private chat with the specified user (!secret)
        if (message.startsWith("!secret ")) {
          //to check if the message string matches a specific pattern and to extract the username
          const match = message.match(/^!secret (\w+)$/); //["!secret john_doe", "john_doe"]
          if (match) {
            targetUsername = match[1]; //"john_doe"
            //targetusername validation if exist
            if (users.has(targetUsername)) {
              console.log(`Now secretly chatting with ${targetUsername}`);
            } else {
              console.log(`User "${targetUsername}" not found.`);
              targetUsername = "";
            }
          }
          //to end private chat
        } else if (message === "!exit") {
          console.log(`No more secretly chatting with ${targetUsername}`);
          targetUsername = "";
        } else {
          if (targetUsername && users.has(targetUsername)) {
            //Encrypt message for private chat 
            const targetPublicKey = users.get(targetUsername);
            try {
            const encryptedMessage = crypto
              .publicEncrypt(targetPublicKey, Buffer.from(message))
              .toString("base64");

            socket.emit("privateMessage", {
              username,
              message: encryptedMessage,
              encrypted: true,
              targetUsername,
            });
          } catch (err){
            console.error("Encryption failed:", err.message);
          }
          } else {
            //Send public message
            socket.emit("message", { username, message });
          }
        }
      }
      rl.prompt();
    });
  });
});

//Initialize users and keys
socket.on("init", (keys) => {
  keys.forEach(([user, key]) => users.set(user, key));
  console.log(`\nThere are currently ${users.size} users in the chat.`);
  rl.prompt();
});

//Handle new user joining the chat
socket.on("newUser", (data) => {
  const { username, publicKey } = data;
  users.set(username, publicKey);
  console.log(`${username} joined the chat`);
  rl.prompt();
});

//Handle public and private msg
socket.on("message", (data) => {
  const { username: senderUsername, message: senderMessage, encrypted } = data;

  if (!encrypted) {
    //show the public message
    console.log(`${senderUsername}: ${senderMessage}`);
  } else {
    if (users.get(senderUsername)) {
      //show the encrypted message 
      console.log(`${senderUsername} (chiper-encrypted): ${senderMessage}`);
    }
  }
  rl.prompt();
});

//Handle private msg
socket.on("privateMessage", (data) => {
  //stored senderusn, targetusn, msg, encrypt from server
  const { username: senderUsername, targetUsername, message, encrypted } = data;
  //if valid
  if (encrypted && targetUsername === username) {
    try {
      const decryptedMessage = crypto //for decrypting encrypted msg
        .privateDecrypt(privateKey, Buffer.from(message, "base64")) 
        .toString("utf8");
      console.log(`${senderUsername} (private): ${decryptedMessage}`);
    } catch {
      console.error("Decryption failed:", err.message);
    }
  }
  rl.prompt();
});

//Handle server disconnect process
socket.on("disconnect", () => {
  console.log("Server disconnected. Exiting...");
  rl.close();
  process.exit(0);
});

//Handle exiting process 
rl.on("SIGINT", () => {
  console.log("\nExiting...");
  socket.disconnect();
  rl.close();
  process.exit(0);
});

//++Handle user leaving the chat 
socket.on("userLeft", (username) => {
  if (users.has(username)) {
    users.delete(username);
    console.log(`${username} left the chat.`);
    rl.prompt();
  }
});

