import { MongoClient } from "mongodb";
import { stripHtml } from "string-strip-html";
import cors from "cors";
import express, { json } from "express";
import joi from "joi";

import dotenv from "dotenv";
import dayjs from "dayjs";

dotenv.config();

const app = express();
app.use(cors());
app.use(json());

const mongoClient = new MongoClient(process.env.MONGO_URI);
const db = mongoClient.db("uol");
const schemaMessage = joi.object({
  to: joi.string().min(1).required(),
  text: joi.string().min(1).required(),
  type: joi.any().allow("message", "private_message").required(),
});
const schemaParticipants = joi.object({
  name: joi.string().min(1).required(),
});
async function handleMsgLeave(user) {
  try {
    await mongoClient.connect();
    await db.collection("messages").insertOne({
      from: user,
      to: "Todos",
      text: "sai da sala..",
      type: "status",
      time: dayjs().format("hh:mm:ss"),
    });
    mongoClient.close();
  } catch (error) {
    console.log(error);
    mongoClient.close();
  }
}
function handleData(string){

  const newString = stripHtml(string)

  return newString.trim()
}

app.post("/participants", async (req, res) => {
  const newUsername = req.body.name;

  const validation = schemaParticipants.validate(req.body);

  if (validation.error) {
    res.status(422).send("Name deve ser strings não vazio");
    console.log(validation.error.details);
    return;
  }
  newUsername = handleData(newUsername)

  try {
    await mongoClient.connect();
    const fetchUser = await db
      .collection("participants")
      .findOne({ name: newUsername });

    if (fetchUser) {
      res.sendStatus(409);
      mongoClient.close();
      return;
    }

    const collectionUser = mongoClient.db("uol").collection("participants");

    await collectionUser.insertOne({
      name: newUsername,
      lastStatus: Date.now(),
    });
    const collectionMsg = mongoClient.db("uol").collection("messages");

    await collectionMsg.insertOne({
      from: newUsername,
      to: "Todos",
      text: "entra na sala..",
      type: "status",
      time: dayjs().format("hh:mm:ss"),
    });
    res.sendStatus(201);

    mongoClient.close();
    return;
  } catch (error) {
    res.status(500).send(error);
    mongoClient.close();
  }
});

app.get("/participants", async (req, res) => {
  await mongoClient.connect();

  try {
    const collectionUser = mongoClient.db("uol").collection("participants");
    const users = await collectionUser.find({}).toArray();
    res.send(users);
    mongoClient.close();
  } catch (error) {
    console.log(error);
    
    if (mongoClient) {
      mongoClient.close();
      return;
    }
  }
});

app.post("/messages", async (req, res) => {
  const bodyMessage = req.body;
  const userVal = req.headers.user;

  const validation = schemaMessage.validate(bodyMessage);

  if (validation.error) {
    res.status(422).send(validation.error.details);
    return;
  }

  bodyMessage = handleData(bodyMessage)
  userVal = handleData(userVal)

  await mongoClient.connect();

  const fetchUser = await db
    .collection("participants")
    .findOne({ name: userVal });
  if (!fetchUser) {
    res.status(422).send("participante inexistente na lista de participantes");
    mongoClient.close();
    return;
  }

  const bodyToData = {
    from: userVal,
    ...bodyMessage,
    time: dayjs().format("hh:mm:ss"),
  };
  try {
    await db.collection("messages").insertOne(bodyToData);
    res.sendStatus(201);
    mongoClient.close();
  } catch (error) {
    res.status(500).send(error);
    mongoClient.close();
  }
});

app.get("/messages", async (req, res) => {
  const user = req.headers.user;
  const queryLimit = parseInt(req.query.limit);

  await mongoClient.connect();

  try {
    const fetchUserMsg = await db
      .collection("messages")
      .find({ $or: [{ to: user }, { to: "Todos" }, { from: user }] })
      .toArray();
    if (queryLimit) {
      res.send(fetchUserMsg.slice(-queryLimit));
      mongoClient.close();
      return;
    }
    res.send(fetchUserMsg);
    mongoClient.close();
  } catch (error) {
    res.status(500).send(error);
    mongoClient.close();
  }
  if (mongoClient) {
    mongoClient.close();
    return;
  }
});

app.post("/status", async (req, res) => {
  const userVal = req.headers.user;
  
  try {
    await mongoClient.connect();
    const fetchUser = await db
      .collection("participants")
      .findOne({ name: userVal });
    if (!fetchUser) {
      res.sendStatus(404);
      mongoClient.close();
      return;
    }
    await db
      .collection("participants")
      .updateOne({ name: userVal }, { $set: { lastStatus: Date.now() } });
    res.sendStatus(200);
    mongoClient.close();
  } catch (error) {
    res.status(500).send(error);
    mongoClient.close();
  }
});
setInterval(async () => {
  await mongoClient.connect();
  try {
    const fetchUsers = await db.collection("participants").find({}).toArray();
    const fetchInvalidUsers = fetchUsers.filter(
      (user) => Date.now() - user.lastStatus > 15000
      
    );
    
    mongoClient.close();
    fetchInvalidUsers.map(async (user) => {
      try {
        await mongoClient.connect();
        await db.collection("participants").deleteOne({ name: user.name });
        mongoClient.close();
        await handleMsgLeave(user.name);
      } catch (error) {
        console.log(error);
        mongoClient.close();
        return
      }
    });
  } catch (error) {
    console.log(error);
    mongoClient.close();
  }
}, 15000);

app.listen(5000, () => {
  console.log("Server is running");
});

/* app.delete("/participants" , async (req, res) => {
    try {
        await mongoClient.connect();
        const db = mongoClient.db("uol")
        const usersColection = db.collection("participants");
        await usersColection.deleteMany({})
                
        res.sendStatus(200)
        mongoClient.close()
     } catch (error) {
      res.status(500).send(error)
        mongoClient.close()
     }
}) */
/* app.delete("/message" , async (req, res) => {
    try {
        await mongoClient.connect();
        const db = mongoClient.db("uol")
        const msgColection = db.collection("messages");
        await msgColection.deleteMany({})
                
        res.sendStatus(200)
        mongoClient.close()
     } catch (error) {
      res.status(500).send(error)
        mongoClient.close()
     }
})
 */
