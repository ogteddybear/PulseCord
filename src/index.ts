import { Client, GatewayIntentBits, type Message, type GuildTextBasedChannel } from 'discord.js';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
  type VoiceConnection,
  type AudioPlayer,
} from '@discordjs/voice';
import * as dotenv from 'dotenv';
import { getVideoInfo, createYtDlpStream } from './ytdlp';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const YOUTUBE_URL_REGEX =
  /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+(\S*)?$/;

interface QueueEntry {
  url: string;
  title: string;
}

interface GuildSession {
  connection: VoiceConnection;
  player: AudioPlayer;
  nowPlaying: QueueEntry;
  queue: QueueEntry[];
  textChannel: GuildTextBasedChannel;
}

const guildSessions = new Map<string, GuildSession>();

function isValidYouTubeUrl(url: string): boolean {
  return YOUTUBE_URL_REGEX.test(url.trim());
}

function destroySession(guildId: string): void {
  const session = guildSessions.get(guildId);
  if (!session) return;
  session.player.stop();
  session.connection.destroy();
  guildSessions.delete(guildId);
}

// Plays the next song in the queue, or destroys the session if the queue is empty
function playNext(guildId: string): void {
  const session = guildSessions.get(guildId);
  if (!session) return;

  const next = session.queue.shift();
  if (!next) {
    destroySession(guildId);
    return;
  }

  session.nowPlaying = next;
  const resource = createAudioResource(createYtDlpStream(next.url), { inputType: StreamType.Arbitrary });
  session.player.play(resource);
  session.textChannel.send(`Now playing: **${next.title}**`).catch(console.error);
}

async function handlePlay(message: Message, url: string): Promise<void> {
  if (!message.guild) return;

  if (!isValidYouTubeUrl(url)) {
    await message.reply('Please provide a valid YouTube URL.');
    return;
  }

  const voiceChannel = message.member?.voice.channel;
  if (!voiceChannel) {
    await message.reply('You need to be in a voice channel to play music!');
    return;
  }

  try {
    const { title } = await getVideoInfo(url);
    const entry: QueueEntry = { url, title };

    // If already playing, add to queue instead of interrupting
    const existingSession = guildSessions.get(message.guild.id);
    if (existingSession) {
      existingSession.queue.push(entry);
      await message.reply(`Added to queue: **${title}** (position ${existingSession.queue.length})`);
      return;
    }

    // Nothing playing — create a new session and start immediately
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator,
    });

    const player = createAudioPlayer();
    const session: GuildSession = {
      connection,
      player,
      nowPlaying: entry,
      queue: [],
      textChannel: message.channel as GuildTextBasedChannel,
    };

    guildSessions.set(message.guild.id, session);
    connection.subscribe(player);

    player.on(AudioPlayerStatus.Idle, () => playNext(message.guild!.id));

    player.on('error', async (error) => {
      console.error('Player error:', error.message);
      await session.textChannel.send('An error occurred. Skipping to next song.');
      playNext(message.guild!.id);
    });

    connection.on('error', (error) => {
      console.error('Connection error:', error.message);
      destroySession(message.guild!.id);
    });

    const resource = createAudioResource(createYtDlpStream(url), { inputType: StreamType.Arbitrary });
    player.play(resource);
    await message.reply(`Now playing: **${title}**`);

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Failed to play audio:', msg);
    await message.reply(
      'Failed to play that video. Make sure yt-dlp is installed and the video is publicly available.',
    );
  }
}

async function handleSkip(message: Message): Promise<void> {
  if (!message.guild) return;

  const session = guildSessions.get(message.guild.id);
  if (!session) {
    await message.reply('Nothing is playing right now.');
    return;
  }

  await message.reply(`Skipped **${session.nowPlaying.title}**.`);
  playNext(message.guild.id);
}

async function handleQueue(message: Message): Promise<void> {
  if (!message.guild) return;

  const session = guildSessions.get(message.guild.id);
  if (!session) {
    await message.reply('Nothing is playing right now.');
    return;
  }

  const lines = [`**Now playing:** ${session.nowPlaying.title}`];

  if (session.queue.length === 0) {
    lines.push('**Queue:** empty');
  } else {
    lines.push('**Up next:**');
    session.queue.forEach((entry, i) => {
      lines.push(`${i + 1}. ${entry.title}`);
    });
  }

  await message.reply(lines.join('\n'));
}

async function handleStop(message: Message): Promise<void> {
  if (!message.guild) return;

  if (!guildSessions.has(message.guild.id)) {
    await message.reply('Nothing is playing right now.');
    return;
  }

  destroySession(message.guild.id);
  await message.reply('Stopped and disconnected.');
}

client.on('messageCreate', async (message: Message) => {
  if (message.author.bot || !message.guild) return;

  const content = message.content.trim();

  if (content.startsWith('!play ')) {
    await handlePlay(message, content.slice(6).trim());
  } else if (content === '!skip') {
    await handleSkip(message);
  } else if (content === '!queue') {
    await handleQueue(message);
  } else if (content === '!stop') {
    await handleStop(message);
  }
});

client.once('ready', () => {
  console.log(`Bot ready: ${client.user?.tag}`);
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('Error: DISCORD_TOKEN is not set in .env');
  process.exit(1);
}

client.login(token);
