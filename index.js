const express = require("express");
const app = express();
app.get("/", (req, res) => res.send("Bot Neva Aktif!"));
app.listen(process.env.PORT || 5000);

require("dotenv").config();
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const Parser = require("rss-parser");
const fs = require("fs");
const https = require("https");

const parser = new Parser();
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const LAST_VIDEO_FILE = "./last_video_id.txt";

function getLastVideoId() {
    try {
        if (fs.existsSync(LAST_VIDEO_FILE)) {
            return fs.readFileSync(LAST_VIDEO_FILE, "utf8").trim();
        }
    } catch (e) {}
    return "";
}

function saveLastVideoId(id) {
    try {
        fs.writeFileSync(LAST_VIDEO_FILE, id, "utf8");
    } catch (e) {}
}

async function alreadySentNotif(channel, link) {
    try {
        const messages = await channel.messages.fetch({ limit: 20 });
        return messages.some((msg) => msg.author.bot && msg.content.includes(link));
    } catch (e) {
        return false;
    }
}

function fetchPage(url) {
    return new Promise((resolve) => {
        https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => resolve(data));
        }).on("error", () => resolve(""));
    });
}

async function isVideoLive(videoLink) {
    try {
        const page = await fetchPage(videoLink);
        return page.includes('"isLiveBroadcast":true') || page.includes('"isLiveContent":true');
    } catch (e) {
        return false;
    }
}

// --- LOGIKA NOTIFIKASI YOUTUBE ---
async function checkYouTube() {
    try {
        const feed = await parser.parseURL(
            `https://www.youtube.com/feeds/videos.xml?channel_id=${process.env.YOUTUBE_CHANNEL_ID}`,
        );
        if (!feed.items.length) return;

        const latestVideo = feed.items[0];
        const lastVideoId = getLastVideoId();

        if (lastVideoId !== latestVideo.id) {
            if (lastVideoId === "") {
                saveLastVideoId(latestVideo.id);
                return;
            }

            const isLive = await isVideoLive(latestVideo.link);

            const channel = client.channels.cache.get(process.env.DISCORD_CHANNEL_ID);
            if (channel) {
                if (await alreadySentNotif(channel, latestVideo.link)) {
                    saveLastVideoId(latestVideo.id);
                    return;
                }

                const roleToPing = isLive
                    ? process.env.ROLE_LIVE_ID
                    : process.env.ROLE_VIDEO_ID;
                const messageType = isLive
                    ? "🔴 Ayah lagi live nih, mampir yuk."
                    : "🎬 Ayah lagi up video yang keren, mampir yuk, jangan lupa Like nya juga yaa.";

                await channel.send({
                    content: `Halo Neva disini\n${messageType}\n<@&${roleToPing}>!\n${latestVideo.link}`,
                });
                saveLastVideoId(latestVideo.id);
            }
        }
    } catch (e) {
        console.error("YouTube Error:", e);
    }
}

client.once("clientReady", () => {
    console.log(`Bot Aktif! Pantau Pesan ID: ${process.env.MESSAGE_ID}`);
    setInterval(checkYouTube, 60000);
});

client.on("messageCreate", async (message) => {
    if (message.content === "!testnotif") {
        const channel = client.channels.cache.get(process.env.DISCORD_CHANNEL_ID);

        if (channel) {
            const roleToPing = process.env.ROLE_VIDEO_ID;
            const messageType =
                "🎬 Ayah lagi up video yang keren, mampir yuk, jangan lupa Like nya juga yaa.";
            const fakeLink = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
            const content = `Halo Neva disini\n${messageType}\n<@&${roleToPing}>!\n${fakeLink}`;

            await channel.send({ content });
            message.reply("✅ Test notifikasi berhasil dikirim!");
        } else {
            message.reply("❌ Channel tidak ditemukan. Cek ID Channel di .env!");
        }
    }

    if (message.content === "!testlive") {
        const channel = client.channels.cache.get(process.env.DISCORD_CHANNEL_ID);

        if (channel) {
            const roleToPing = process.env.ROLE_LIVE_ID;
            const messageType = "🔴 Ayah lagi live nih, mampir yuk.";
            const fakeLink = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
            const content = `Halo Neva disini\n${messageType}\n<@&${roleToPing}>!\n${fakeLink}`;

            await channel.send({ content });
            message.reply("✅ Test live berhasil dikirim!");
        } else {
            message.reply("❌ Channel tidak ditemukan. Cek ID Channel di .env!");
        }
    }

    if (message.content === "!hapuskk") {
        try {
            const messages = await message.channel.messages.fetch({ limit: 100 });
            const botMessages = messages.filter((msg) => msg.author.bot);
            await message.channel.bulkDelete(botMessages, true);
            await message.delete().catch(() => {});
        } catch (e) {
            console.error("Hapus Error:", e);
        }
    }
});

// --- LOGIKA REAKSI EMOT UNTUK ROLE ---

client.on("messageReactionAdd", async (reaction, user) => {
    if (user.bot) return;
    if (reaction.message.id !== process.env.MESSAGE_ID) return;

    if (reaction.partial) await reaction.fetch();

    const member = reaction.message.guild.members.cache.get(user.id);
    if (reaction.emoji.name === "🎬")
        await member.roles.add(process.env.ROLE_VIDEO_ID);
    if (reaction.emoji.name === "🔴")
        await member.roles.add(process.env.ROLE_LIVE_ID);
});

client.on("messageReactionRemove", async (reaction, user) => {
    if (user.bot) return;
    if (reaction.message.id !== process.env.MESSAGE_ID) return;

    if (reaction.partial) await reaction.fetch();

    const member = reaction.message.guild.members.cache.get(user.id);
    if (reaction.emoji.name === "🎬")
        await member.roles.remove(process.env.ROLE_VIDEO_ID);
    if (reaction.emoji.name === "🔴")
        await member.roles.remove(process.env.ROLE_LIVE_ID);
});

client.login(process.env.BOT_TOKEN);
