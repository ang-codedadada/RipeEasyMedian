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
const LAST_LIVE_FILE  = "./last_live_id.txt";

function getFile(path) {
    try {
        if (fs.existsSync(path)) return fs.readFileSync(path, "utf8").trim();
    } catch (e) {}
    return "";
}

function saveFile(path, value) {
    try { fs.writeFileSync(path, value, "utf8"); } catch (e) {}
}

function fetchPage(url, redirects = 4) {
    return new Promise((resolve) => {
        const req = https.get(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36" } }, (res) => {
            const location = res.headers.location;
            if ([301, 302, 303].includes(res.statusCode) && location && redirects > 0) {
                const next = location.startsWith("http") ? location : `https://www.youtube.com${location}`;
                resolve(fetchPage(next, redirects - 1));
                return;
            }
            let data = "";
            res.on("data", (chunk) => {
                data += chunk;
                if (data.length > 600000) req.destroy();
            });
            res.on("end", () => resolve(data));
        });
        req.on("error", () => resolve(""));
    });
}

async function alreadySentNotif(channel, link) {
    try {
        const messages = await channel.messages.fetch({ limit: 20 });
        return messages.some((msg) => msg.author.bot && msg.content.includes(link));
    } catch (e) {
        return false;
    }
}

// --- CEK LIVE (cek tiap video RSS terbaru apakah sedang live) ---
async function checkLive() {
    try {
        const feed = await parser.parseURL(
            `https://www.youtube.com/feeds/videos.xml?channel_id=${process.env.YOUTUBE_CHANNEL_ID}`,
        );
        if (!feed.items.length) return;

        const lastLiveId = getFile(LAST_LIVE_FILE);

        for (const item of feed.items.slice(0, 3)) {
            // Ambil video ID dari link
            const vidMatch = item.link && item.link.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
            const videoId = vidMatch ? vidMatch[1] : null;
            if (!videoId) continue;
            if (videoId === lastLiveId) continue;

            // Cek halaman video apakah sekarang sedang live
            const page = await fetchPage(`https://www.youtube.com/watch?v=${videoId}`);
            const isLiveNow = page.includes('"isLiveNow":true') ||
                              page.includes('"isLiveNow": true');

            if (!isLiveNow) continue;

            const liveLink = `https://www.youtube.com/watch?v=${videoId}`;
            const channel = client.channels.cache.get(process.env.DISCORD_CHANNEL_ID);

            if (channel) {
                if (await alreadySentNotif(channel, liveLink)) {
                    saveFile(LAST_LIVE_FILE, videoId);
                    return;
                }

                await channel.send({
                    content: `Halo Neva disini\n🔴 Ayah lagi live nih, mampir yuk.\n<@&${process.env.ROLE_LIVE_ID}>!\n${liveLink}`,
                });
                saveFile(LAST_LIVE_FILE, videoId);
            }
            return;
        }
    } catch (e) {
        console.error("Live Check Error:", e);
    }
}

// --- CEK VIDEO BARU (RSS, skip jika live/replay) ---
async function checkYouTube() {
    try {
        const feed = await parser.parseURL(
            `https://www.youtube.com/feeds/videos.xml?channel_id=${process.env.YOUTUBE_CHANNEL_ID}`,
        );
        if (!feed.items.length) return;

        const latestVideo = feed.items[0];
        const lastVideoId = getFile(LAST_VIDEO_FILE);

        if (lastVideoId === latestVideo.id) return;

        if (lastVideoId === "") {
            saveFile(LAST_VIDEO_FILE, latestVideo.id);
            return;
        }

        // Cek apakah ini live/replay — kalau iya, skip (sudah ditangani checkLive)
        const page = await fetchPage(latestVideo.link);
        const isLiveContent = page.includes('"isLiveContent":true') ||
                              page.includes('"isLiveBroadcast":true');

        saveFile(LAST_VIDEO_FILE, latestVideo.id);

        if (isLiveContent) return;

        const channel = client.channels.cache.get(process.env.DISCORD_CHANNEL_ID);
        if (channel) {
            if (await alreadySentNotif(channel, latestVideo.link)) return;

            await channel.send({
                content: `Halo Neva disini\n🎬 Ayah lagi up video yang keren, mampir yuk, jangan lupa Like nya juga yaa.\n<@&${process.env.ROLE_VIDEO_ID}>!\n${latestVideo.link}`,
            });
        }
    } catch (e) {
        console.error("YouTube Error:", e);
    }
}

client.once("clientReady", () => {
    console.log(`Bot Aktif! Pantau Pesan ID: ${process.env.MESSAGE_ID}`);
    setInterval(checkYouTube, 60000);
    setInterval(checkLive, 60000);
});

client.on("messageCreate", async (message) => {
    if (message.content === "!testnotif") {
        const channel = client.channels.cache.get(process.env.DISCORD_CHANNEL_ID);
        if (channel) {
            await channel.send({
                content: `Halo Neva disini\n🎬 Ayah lagi up video yang keren, mampir yuk, jangan lupa Like nya juga yaa.\n<@&${process.env.ROLE_VIDEO_ID}>!\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ`,
            });
            message.reply("✅ Test notifikasi video berhasil dikirim!");
        } else {
            message.reply("❌ Channel tidak ditemukan. Cek ID Channel di .env!");
        }
    }

    if (message.content === "!testlive") {
        const channel = client.channels.cache.get(process.env.DISCORD_CHANNEL_ID);
        if (channel) {
            await channel.send({
                content: `Halo Neva disini\n🔴 Ayah lagi live nih, mampir yuk.\n<@&${process.env.ROLE_LIVE_ID}>!\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ`,
            });
            message.reply("✅ Test notifikasi live berhasil dikirim!");
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
    if (reaction.emoji.name === "🎬") await member.roles.add(process.env.ROLE_VIDEO_ID);
    if (reaction.emoji.name === "🔴") await member.roles.add(process.env.ROLE_LIVE_ID);
});

client.on("messageReactionRemove", async (reaction, user) => {
    if (user.bot) return;
    if (reaction.message.id !== process.env.MESSAGE_ID) return;
    if (reaction.partial) await reaction.fetch();

    const member = reaction.message.guild.members.cache.get(user.id);
    if (reaction.emoji.name === "🎬") await member.roles.remove(process.env.ROLE_VIDEO_ID);
    if (reaction.emoji.name === "🔴") await member.roles.remove(process.env.ROLE_LIVE_ID);
});

client.login(process.env.BOT_TOKEN);
