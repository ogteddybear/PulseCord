import { Client, GatewayIntentBits, type Message } from 'discord.js';
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

const guildSessions = new Map<string, { connection: VoiceConnection; player: AudioPlayer }>();

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

    destroySession(message.guild.id);

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator,
    });

    const resource = createAudioResource(createYtDlpStream(url), { inputType: StreamType.Arbitrary });
    const player = createAudioPlayer();

    guildSessions.set(message.guild.id, { connection, player });
    connection.subscribe(player);
    player.play(resource);

    await message.reply(`Now playing: **${title}**`);

    player.on(AudioPlayerStatus.Idle, () => destroySession(message.guild!.id));

    player.on('error', async (error) => {
      console.error('Player error:', error.message);
      await message.reply('An error occurred during playback. Disconnecting.');
      destroySession(message.guild!.id);
    });

    connection.on('error', (error) => {
      console.error('Connection error:', error.message);
      destroySession(message.guild!.id);
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Failed to play audio:', msg);
    await message.reply(
      'Failed to play that video. Make sure yt-dlp is installed and the video is publicly available.',
    );
  }
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
  } else if (content === '!stop') {
    await handleStop(message);
  } else if (isValidYouTubeUrl(content)) {
    await handlePlay(message, content);
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
