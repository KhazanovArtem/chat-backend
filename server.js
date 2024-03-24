import http from "http";
import express from "express";
import WebSocket, {WebSocketServer} from "ws";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();

app.use(cors());
app.use(
    bodyParser.json({
        type(req) {
            return true;
        },
    })
);
app.use((req, res, next) => {
    res.setHeader("Content-Type", "application/json");
    next();
});

const users = {};


function broadcastData(data) {
    [...wsServer.clients]
        .filter(ws => ws.userName)
        .filter(ws => ws.readyState === WebSocket.OPEN)
        .forEach(ws => ws.send(JSON.stringify(data)));
}

function onRegister(ws, msg) {
    if (ws.userName) {
        ws.send(JSON.stringify({type: "error", command: "register", reason: "Already registered"}));
        return;
    }

    const name = msg.user?.name;

    if (!name) {
        ws.send(JSON.stringify({type: "error", command: "register", reason: "Name cannot be empty"}));
        return;
    }

    if (users[name]) {
        ws.send(JSON.stringify({type: "error", command: "register", reason: "Name already exists"}));
        return;
    }

    users[name] = {name: msg.user.name};
    ws.userName = name;

    ws.send(JSON.stringify({type: "ok", command: "register", user: `${name}`}));
    broadcastData({type: "users", users: Object.values(users)});
}

function onExit(ws, msg) {
    if (!ws.userName || !users[ws.userName]) {
        ws.send(JSON.stringify({type: "error", command: "exit", reason: "Not registered"}));
        return;
    }

    delete users[ws.userName];
    delete ws.userName;
    ws.send(JSON.stringify({type: "ok", command: "exit"}));
    broadcastData({type: "users", users: Object.values(users)});
}

function onSend(ws, msg) {
    if (!ws.userName || !users[ws.userName]) {
        ws.send(JSON.stringify({type: "error", command: "send", reason: "Not registered"}));
        return;
    }
    msg.created = new Date().toISOString();
    broadcastData({type: "message", from: ws.userName, data: msg.data, created: msg.created});
}

function logMessage(ws, msg) {
    console.log(`Message from '${ws.userName}':`, msg);
}

function onClientMessage(ws, data, isBinary) {
    if (isBinary) {
        return; // supporting only json
    }

    const msg = JSON.parse(data);
    logMessage(ws, msg);

    switch (msg.type) {
        case "register":
            onRegister(ws, msg);
            return;
        case "exit":
            onExit(ws, msg);
            return;
        case "send":
            onSend(ws, msg);
            return;
        default:
            ws.send(JSON.stringify({type: "error", command: msg.type, reason: "Invalid command"}));
            return;
    }
}

function onDisconnect(ws) {
    console.log(`User '${ws.userName}' disconnected`);

    if (!ws.userName || !users[ws.userName]) {
        return;
    }

    delete users[ws.userName];
    broadcastData({type: "users", users: Object.values(users)});
}

const server = http.createServer(app);
const wsServer = new WebSocketServer({server});
wsServer.on("connection", ws => {
    console.log("New client connected");
    ws.on("message", (data, isBinary) => onClientMessage(ws, data, isBinary));
    ws.on("close", () => onDisconnect(ws));
    ws.on("error", () => onDisconnect(ws));
});

const port = process.env.PORT || 8000;

const bootstrap = async () => {
    try {
        server.listen(port, () =>
            console.log(`Server has been started on http://localhost:${port}`)
        );
    } catch (error) {
        console.error(error);
    }
};

bootstrap();