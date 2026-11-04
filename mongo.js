// mongo.js: sets up the chat's database, chatDB, on MongoDB.
// YOU write both functions at Station A. Replace each throw line with your code.
import { MongoClient } from "mongodb";
import { getMongoURI } from "./setup/practice-server.js";

const DB_NAME = "chatDB";

// ---------- Station A: Connect ----------
// Gets the connection string, connects a MongoClient to it,
// and gives back (a promise for) the chatDB database.
export async function connectDB() {
  const uri = await getMongoURI();
  const client = new MongoClient(uri);
  await client.connect();
  return client.db(DB_NAME)
}

// ---------- Station A: Set up the collections ----------
// Runs every time the server starts, but only fills chatDB when it's empty.
// Puts in the first user (WM Bot), the first chat (West-MEC Lounge), and the first message.
export async function seedDatabase(db) {
  const users = db.collection("users");
  const chats = db.collection("chats");
  const messages = db.collection("messages");
  const now = new Date();
  const welcome = "Welcome to WM Chat! Everyone who signs up joins the Lounge. Say hi!";

  // Seed the first user (WM Bot)
  //if user has documents give back false
  if((await users.countDocuments())>0) return false;
  //user for WM BOT _id: wmbot; displayName: WM bot; createdAt: now;
  //put bot in the WM lounge chat with the bot and its welcome message. messags:chatId: chatId; text: welcome; sentAt: now;
  //give back true if seeding was successful
  //save what the charts insertOne gives back in a const; the id is a property on it
  //check > insert user > const result = inset chat >  insert message > return true

  await users.insertOne({
    _id: "wmbot",
    displayName: "WM bot",
    createdAt: now,
    updatedAt: now,
    welcomeMessage: welcome,
  });

  const chatId = "west-mec-lounge";
  await chats.insertOne({
    _id: chatId,
    name: "West-MEC Lounge",
    createdAt: now,
    updatedAt: now,
  });

  await messages.insertOne({
    chatId: chatId,
    text: welcome,
    sentAt: now,
  });

  return true;
}




