import { installSpeech } from '@discordy/core/application/ports/speech';
import { speak } from './tts';

// Imported by the renderer entry so gateway TTS messages are read through the browser's speech synthesis.
installSpeech({ speak });
