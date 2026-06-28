const express = require("express");
const app = express();
app.get("/", (req, res) => res.send("Bot Neva Aktif!"));
app.listen(process.env.PORT || 5000);

require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");
const https = require("https");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [],
});

const LAST_VIDEO_FILE = "./last_video_id.txt";
const LAST_LIVE_FILE  = "./last_live_id.txt";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function getFile(path) {
    try { if (fs.existsSync(path)) return fs.readFileSync(path, "utf8").trim(); } catch (e) {}
    return "";
}
function saveFile(path, value) {
    try { fs.writeFileSync(path, value, "utf8"); } catch (e) {}
}

function fetchPage(url, redirects = 5) {
    return new Promise((resolve) => {
        const req = https.get(url, { headers: { "User-Agent": UA } }, (res) => {
            const loc = res.headers.location;
            if ([301, 302, 303].includes(res.statusCode) && loc && redirects > 0) {
                resolve(fetchPage(loc.startsWith("http") ? loc : `https://www.youtube.com${loc}`, redirects - 1));
                return;
            }
            let data = "";
            res.on("data", (chunk) => { data += chunk; if (data.length > 700000) req.destroy(); });
            res.on("end", () => resolve(data));
        });
        req.on("error", () => resolve(""));
    });
}

// Ambil video ID terbaru dari halaman channel (bukan RSS)
async function getLatestVideoIds() {
    const page = await fetchPage(`https://www.youtube.com/channel/${process.env.YOUTUBE_CHANNEL_ID}/videos`);
    const matches = [...page.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)];
    return [...new Set(matches.map(m => m[1]))].slice(0, 5);
}

async function alreadySentNotif(channel, link) {
    try {
        const messages = await channel.messages.fetch({ limit: 20 });
        return messages.some((msg) => msg.author.bot && msg.content.includes(link));
    } catch (e) { return false; }
}

// Cari video live dari halaman tertentu
function findLiveVideoId(page) {
    // Metode 1: badge LIVE_NOW di sebelah video ID
    const badgeIdx = page.indexOf('"BADGE_STYLE_TYPE_LIVE_NOW"');
    if (badgeIdx !== -1) {
        const nearby = page.substring(Math.max(0, badgeIdx - 300), badgeIdx + 300);
        const m = nearby.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
        if (m) return { videoId: m[1], method: "badge" };
    }

    // Metode 2: isLiveNow/isLive ada di page lalu ambil videoId terdekat
    const liveIdx = page.search(/"isLiveNow"\s*:\s*true|"isLive"\s*:\s*true/);
    if (liveIdx !== -1) {
        const nearby = page.substring(Math.max(0, liveIdx - 500), liveIdx + 500);
        const m = nearby.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
        if (m) return { videoId: m[1], method: "isLive" };
    }

    // Metode 3: ada hlsManifestUrl (pasti sedang live)
    if (page.includes('"hlsManifestUrl"')) {
        const m = page.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
        if (m) return { videoId: m[1], method: "hls" };
    }

    return null;
}

// --- CEK LIVE ---
async function checkLive() {
    try {
        const channelId = process.env.YOUTUBE_CHANNEL_ID;

        // Cek halaman channel utama dulu (lebih reliable saat live)
        const channelPage = await fetchPage(`https://www.youtube.com/channel/${channelId}`);
        console.log(`[Live] channel page len=${channelPage.length}`);

        let result = findLiveVideoId(channelPage);

        // Jika tidak ketemu di channel page, coba /live
        if (!result) {
            const livePage = await fetchPage(`https://www.youtube.com/channel/${channelId}/live`);
            console.log(`[Live] /live page len=${livePage.length}`);
            result = findLiveVideoId(livePage);
        }

        if (!result) {
            console.log("[Live] Tidak ada live terdeteksi");
            return;
        }

        const { videoId, method } = result;
        console.log(`[Live] LIVE TERDETEKSI! videoId=${videoId} method=${method}`);

        if (videoId === getFile(LAST_LIVE_FILE)) {
            console.log("[Live] Sudah dikirim sebelumnya, skip");
            return;
        }

        const liveLink = `https://www.youtube.com/watch?v=${videoId}`;
        const channel = client.channels.cache.get(process.env.DISCORD_CHANNEL_ID);
        if (!channel) return;
        if (await alreadySentNotif(channel, liveLink)) { saveFile(LAST_LIVE_FILE, videoId); return; }

        await channel.send({
            content: `@everyone\nHalo Neva disini\n🔴 Ayah lagi live nih, mampir yuk.\n${liveLink}`,
        });
        saveFile(LAST_LIVE_FILE, videoId);
        console.log(`[Live] Notif live terkirim: ${liveLink}`);
    } catch (e) {
        console.error("Live Check Error:", e.message);
    }
}

// --- CEK VIDEO BARU ---
async function checkYouTube() {
    try {
        const videoIds = await getLatestVideoIds();
        if (!videoIds.length) { console.log("[YT] Tidak ada video ditemukan di channel page"); return; }

        const latestId = videoIds[0];
        const lastVideoId = getFile(LAST_VIDEO_FILE);

        console.log(`[YT] Latest=${latestId} Last=${lastVideoId}`);

        if (latestId === lastVideoId) return;

        if (lastVideoId === "") {
            saveFile(LAST_VIDEO_FILE, latestId);
            return;
        }

        // Cek halaman video — skip kalau live/replay
        const page = await fetchPage(`https://www.youtube.com/watch?v=${latestId}`);
        const isLiveContent = page.includes('"isLiveContent":true') || page.includes('"isLiveBroadcast":true');
        saveFile(LAST_VIDEO_FILE, latestId);

        if (isLiveContent) { console.log("[YT] Skip — live/replay content"); return; }

        const videoLink = `https://www.youtube.com/watch?v=${latestId}`;
        const channel = client.channels.cache.get(process.env.DISCORD_CHANNEL_ID);
        if (!channel) return;
        if (await alreadySentNotif(channel, videoLink)) return;

        await channel.send({
            content: `@everyone\nHalo Neva disini\n🎬 Ayah lagi up video yang keren, mampir yuk, jangan lupa Like nya juga yaa.\n${videoLink}`,
        });
        console.log(`[YT] Notif video terkirim: ${videoLink}`);
    } catch (e) {
        console.error("YouTube Error:", e.message);
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
                content: `@everyone\nHalo Neva disini\n🎬 Ayah lagi up video yang keren, mampir yuk, jangan lupa Like nya juga yaa.\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ`,
            });
            message.reply("✅ Test notifikasi video berhasil dikirim!");
        } else {
            message.reply("❌ Channel tidak ditemukan.");
        }
    }

    if (message.content === "!testlive") {
        const channel = client.channels.cache.get(process.env.DISCORD_CHANNEL_ID);
        if (channel) {
            await channel.send({
                content: `@everyone\nHalo Neva disini\n🔴 Ayah lagi live nih, mampir yuk.\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ`,
            });
            message.reply("✅ Test notifikasi live berhasil dikirim!");
        } else {
            message.reply("❌ Channel tidak ditemukan.");
        }
    }

    if (message.content === "!hapuskk") {
        try {
            const messages = await message.channel.messages.fetch({ limit: 100 });
            const botMessages = messages.filter((msg) => msg.author.bot);
            await message.channel.bulkDelete(botMessages, true);
            await message.delete().catch(() => {});
        } catch (e) { console.error("Hapus Error:", e.message); }
    }
});

client.login(process.env.BOT_TOKEN);
