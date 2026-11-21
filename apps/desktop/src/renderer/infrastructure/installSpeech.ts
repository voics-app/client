import { installSpeech } from '@discordy/core/application/ports/speech';
import { speak } from './tts';
import { streamerActive } from '../interface/app/streamer';

// Imported by the renderer entry so gateway TTS messages are read through the browser's speech synthesis.
installSpeech({ speak: (text, rate) => !streamerActive() && speak(text, rate) });
