// server.js: the chat's server. Express sends the chat page AND answers every /api request.
// Every message, chat, and user lives in MongoDB (chatDB), and the server has the final say.
// YOU write the routes, one day at a time. Each one answers 501 "not built yet" until you build it.
import express from "express";
import { ObjectId } from "mongodb";
import { connectDB, seedDatabase } from "./mongo.js";
import { setUpChat } from "./setup/chat.js";

const PORT = 3000;
const app = express();
app.use(express.json());

// Sends the chat page (everything in the public folder) to the browser.
app.use(express.static("public"));

// ALREADY DONE: connects with your connectDB(), seeds with your seedDatabase(),
// adds GET /api/status and POST /api/reset.
const db = await setUpChat(app, connectDB, seedDatabase);

function chatIdQuery(id) {
  if (ObjectId.isValid(id)) {
    return { $or: [{ _id: new ObjectId(id) }, { _id: id }] };
  }
  return { _id: id };
}

async function findChat(id) {
  return db.collection("chats").findOne(chatIdQuery(id));
}

// ---------- Station U: Accounts ----------
// POST /api/users   body: { "username": "alan", "displayName": "Alan M." }
// Signs up a new user. 400 if the username breaks the rules, 409 if it's taken.
// Everyone who signs up joins the West-MEC Lounge.
app.post("/api/users", async (req, res) => {
  /* res.status(501).json({ error: "POST /api/users is not built yet (Station U)" }); */

  try {
    const username = req.body.username;
    const displayName = req.body.displayName;

    //400 if the username breaks the rules
    //rules:3 to 20 lowercase letters, numbers, or dashes.
    const usernameRegex = /^[a-z0-9-]{3,20}$/;
    if (typeof username !== "string" || !usernameRegex.test(username)) {
      return res.status(400).json({ error: "Invalid username. Must be 3-20 lowercase letters, numbers, or dashes." });
    }
    if (typeof displayName !== "string" || !displayName.trim()) {
      return res.status(400).json({ error: "Display name is required." });
    }

    //409 if it's taken
    const existingUser = await db.collection("users").findOne({
      $or: [{ _id: username }, { username: username }],
    });
    if (existingUser) {
      return res.status(409).json({ error: "Username is already taken." });
    }

    const newUser = {
      _id: username,
      displayName: displayName,
      createdAt: new Date()
    };

    const lounge = await db.collection("chats").findOne({ name: "West-MEC Lounge" });
    if (!lounge) {
      return res.status(500).json({ error: "West-MEC Lounge not found" });
    }

    try {
      await db.collection("users").insertOne(newUser);
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({ error: "Username is already taken." });
      }
      throw error;
    }

    //Everyone who signs up joins the West-MEC Lounge chat automatically.
    await db.collection("chats").updateOne(
      { _id: lounge._id },
      { $addToSet: { members: username } }
    );
    return res.status(201).json(newUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/users/:username: signs in. Sends back ONE user, or 404 if there's no one with that username.
app.get("/api/users/:username", async (req, res) => {
  /* res.status(501).json({ error: "GET /api/users/:username is not built yet (Station U)" }); */

  try {
    const username = req.params.username;
    const user = await db.collection("users").findOne({
      $or: [{ _id: username }, { username: username }],
    });

    //if user does not exist, send 404
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    return res.json({ ...user, _id: user.username || user._id });
  }catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/users: sends back an array of every user, A to Z (the People list).
app.get("/api/users", async (req, res) => {
  /* res.status(501).json({ error: "GET /api/users is not built yet (Station U)" }); */
  try {
    const users = await db.collection("users").find().sort({ displayName: 1 }).toArray();
    return res.json(users.map((user) => ({ ...user, _id: user.username || user._id })));
  }
  catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------- Day 3: Conversations ----------
// GET /api/chats?user=alan: sends back every chat that user is a member of, newest first.
app.get("/api/chats", async (req, res) => {
  /* res.status(501).json({ error: "GET /api/chats is not built yet (Day 3)" }); */

  // Gives back every chat the specific user is in so it displays in the chat list.
  try {
    const user = req.query.user;
    if (!user) {
      return res.status(400).json({ error: "user query parameter is required" });
    }
    const chats = await db.collection("chats").find({ members: user }).sort({ lastMessage: -1 }).toArray();
    res.json(chats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }

});

// POST /api/chats/direct   body: { "from": "alan", "to": "maria" }
// Opens a direct message between two people. Already have one? Sends that one back (200).
// New one? 201. 400 if someone is missing or it's yourself, 404 if either user doesn't exist.
app.post("/api/chats/direct", async (req, res) => {
  /* res.status(501).json({ error: "POST /api/chats/direct is not built yet (Day 3)" }); */
  try {
    const { from, to } = req.body;

    if (typeof from !== "string" || !from || typeof to !== "string" || !to) {
      return res.status(400).json({ error: "from and to usernames are required" });
    }
    if (from === to) {
      return res.status(400).json({ error: "Cannot send a direct message to yourself" });
    }

    const users = db.collection("users");
    const [fromUser, toUser] = await Promise.all([
      users.findOne({ $or: [{ _id: from }, { username: from }] }),
      users.findOne({ $or: [{ _id: to }, { username: to }] }),
    ]);
    if (!fromUser || !toUser) {
      return res.status(404).json({ error: "One or both users not found" });
    }

    const existingChat = await db.collection("chats").findOne({
      type: "direct",
      members: { $all: [from, to], $size: 2 },
    });
    if (existingChat) {
      return res.status(200).json(existingChat);
    }

    const now = new Date();
    const newChat = {
      members: [from, to],
      type: "direct",
      lastMessage: null,
      createdAt: now,
      updatedAt: now,
    };
    const result = await db.collection("chats").insertOne(newChat);
    return res.status(201).json({ ...newChat, _id: result.insertedId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/chats/group   body: { "from": "alan", "name": "Study Group", "members": ["maria", "jay"] }
// Starts a group chat. The person who starts it is in it too.
// 400 if there's no name or no one else, 404 if anyone isn't a user.
app.post("/api/chats/group", async (req, res) => {
  /* res.status(501).json({ error: "POST /api/chats/group is not built yet (Day 3)" }); */
  try {
    const { from, name, members } = req.body;
    if (
      typeof from !== "string" || !from ||
      typeof name !== "string" || !name.trim() ||
      !Array.isArray(members) || members.some((member) => typeof member !== "string" || !member)
    ) {
      return res.status(400).json({ error: "from, name, and at least one member are required" });
    }

    const otherMembers = [...new Set(members.filter((member) => member !== from))];
    if (otherMembers.length === 0) {
      return res.status(400).json({ error: "A group must include at least one other member" });
    }

    const users = db.collection("users");
    const usernames = [from, ...otherMembers];
    const foundUsers = await users.find({
      $or: usernames.flatMap((username) => [{ _id: username }, { username: username }]),
    }).toArray();
    const foundUsernames = new Set(foundUsers.map((user) => user.username || user._id));
    if (usernames.some((username) => !foundUsernames.has(username))) {
      return res.status(404).json({ error: "User not found" });
    }

    const now = new Date();
    const newChat = {
      members: usernames,
      type: "group",
      name: name.trim(),
      lastMessage: null,
      createdBy: from,
      createdAt: now,
      updatedAt: now,
    };
    const result = await db.collection("chats").insertOne(newChat);
    return res.status(201).json({ ...newChat, _id: result.insertedId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------- Day 4: Messages ----------
// GET /api/chats/:id/messages?user=alan&after=2026-10-12T18:00:00.000Z
// Sends back the chat's messages (filter by chatID), oldest first (sentAt). With after: only the ones sent after that time.
// 400 bad id, 404 no chat, 403 if user isn't a member.
// the checks are the same as the first checks add people route; with user instead of by.
// find by chatId, sort sentAt oldest first (1), then to array.
app.get("/api/chats/:id/messages", async (req, res) => {
  /* res.status(501).json({ error: "GET /api/chats/:id/messages is not built yet (Day 4)" }); */

  try {
    const { user, after } = req.query;
    if (typeof user !== "string" || !user) {
      return res.status(400).json({ error: "user is required" });
    }

    const chat = await findChat(req.params.id);
    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }
    if (!chat.members.includes(user)) {
      return res.status(403).json({ error: "User is not a member of this chat" });
    }

    const query = { chatId: chat._id };
    if (after !== undefined) {
      const sentAfter = new Date(after);
      if (Number.isNaN(sentAfter.getTime())) {
        return res.status(400).json({ error: "Invalid after date" });
      }
      query.sentAt = { $gt: sentAfter };
    }

    const messages = await db.collection("messages").find(query).sort({ sentAt: 1 }).toArray();
    return res.json(messages);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/chats/:id/messages   body: { "from": "alan", "text": "hey!" }
// Sends a message. Also saves it on the chat as lastMessage, so the chat list can show it.
// 400 bad id or bad text, 404 no chat, 403 if from isn't a member.
app.post("/api/chats/:id/messages", async (req, res) => {
  /* res.status(501).json({ error: "POST /api/chats/:id/messages is not built yet (Day 4)" }); */

  try {
    const { from, text } = req.body;
    if (typeof from !== "string" || !from || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "from and text are required" });
    }

    const chat = await findChat(req.params.id);
    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }
    if (!chat.members.includes(from)) {
      return res.status(403).json({ error: "User is not a member of this chat" });
    }

    const message = { chatId: chat._id, from, text, sentAt: new Date() };
    await db.collection("messages").insertOne(message);
    await db.collection("chats").updateOne(
      { _id: chat._id },
      { $set: { updatedAt: message.sentAt, lastMessage: message } }
    );
    return res.status(201).json(message);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------- Day 3: Conversations (adding people) ----------
// ALREADY DONE (you use it in add people): saves a gray "system" line in the chat, like "alan added maria",
// and makes it the chat's lastMessage.
async function systemMessage(chatId, text) {
  const message = { chatId: chatId, from: "system", text: text, sentAt: new Date() };
  await db.collection("messages").insertOne(message);
  await db.collection("chats").updateOne(
    { _id: chatId },
    { $set: { updatedAt: message.sentAt, lastMessage: { from: "system", text: text, sentAt: message.sentAt } } }
  );
}

// PATCH /api/chats/:id/members   body: { "by": "alan", "username": "jay" }
// Adds someone to a group. 400 bad id or a direct message, 404 no chat or no user,
// 403 if by isn't a member, 409 if they're already in it.
app.patch("/api/chats/:id/members", async (req, res) => {
  /* res.status(501).json({ error: "PATCH /api/chats/:id/members is not built yet (Day 3)" }); */

  try {
    const { by, username } = req.body;
    if (typeof by !== "string" || !by || typeof username !== "string" || !username) {
      return res.status(400).json({ error: "by and username are required" });
    }

    const chat = await findChat(req.params.id);
    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }
    if (chat.type !== "group") {
      return res.status(400).json({ error: "Cannot add a member to a direct message" });
    }
    const user = await db.collection("users").findOne({
      $or: [{ _id: username }, { username: username }],
    });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    if (!chat.members.includes(by)) {
      return res.status(403).json({ error: "Only group members can add members" });
    }
    if (chat.members.includes(username)) {
      return res.status(409).json({ error: "User is already a member" });
    }
    const memberUsername = user.username || user._id;
    await db.collection("chats").updateOne(
      { _id: chat._id },
      { $addToSet: { members: memberUsername } }
    );
    await systemMessage(chat._id, `${by} added ${memberUsername}`);
    const updatedChat = await db.collection("chats").findOne({ _id: chat._id });
    return res.status(200).json(updatedChat);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------- Extension (done early): Leave and Rename ----------
// DELETE /api/chats/:id/members/:username: leaves a group.
// The last one out deletes the chat AND its messages. 400 bad id or a direct message, 404 no chat or not a member.
app.delete("/api/chats/:id/members/:username", async (req, res) => {
  /* res.status(501).json({ error: "DELETE /api/chats/:id/members/:username is not built yet (Extension)" }); */
  try {
    const { username } = req.params;
    const chat = await findChat(req.params.id);
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    if (chat.type !== "group") {
      return res.status(400).json({ error: "Cannot leave a direct message" });
    }
    if (!chat.members.includes(username)) {
      return res.status(404).json({ error: "User is not a member of this chat" });
    }

    if (chat.members.length === 1) {
      await db.collection("messages").deleteMany({ chatId: chat._id });
      await db.collection("chats").deleteOne({ _id: chat._id });
      return res.json({ deleted: true });
    }

    await db.collection("chats").updateOne(
      { _id: chat._id },
      { $pull: { members: username } }
    );
    await systemMessage(chat._id, `${username} left the chat`);
    return res.json(await db.collection("chats").findOne({ _id: chat._id }));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/chats/:id   body: { "by": "alan", "name": "Study Squad" }
// Renames a group. 400 bad id, no name, or a direct message, 404 no chat, 403 if by isn't a member.
app.patch("/api/chats/:id", async (req, res) => {
  try {
    const { by, name } = req.body;
    if (typeof by !== "string" || !by || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "by and name are required" });
    }
    const chat = await findChat(req.params.id);
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    if (chat.type !== "group") {
      return res.status(400).json({ error: "Cannot rename a direct message" });
    }
    if (!chat.members.includes(by)) {
      return res.status(403).json({ error: "Only group members can rename the chat" });
    }
    await db.collection("chats").updateOne(
      { _id: chat._id },
      { $set: { name: name.trim(), updatedAt: new Date() } }
    );
    return res.json(await db.collection("chats").findOne({ _id: chat._id }));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Starts the server. Already running in another terminal? You get EADDRINUSE: Ctrl+C there first.
app.listen(PORT, (error) => {
  if (error) throw error;
  console.log(`WM Chat running at http://localhost:${PORT}`);
});