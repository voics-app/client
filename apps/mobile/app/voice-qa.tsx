import { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import Constants from 'expo-constants';
import type { Attachment } from '@discordy/core/contracts/rest';
import { VoiceRecorder } from '../src/messages/VoiceRecorder';
import { AttachmentList } from '../src/messages/attachments/AttachmentList';
import { theme } from '../src/theme';
import { voiceMessageBody } from '../src/messages/messageService';

/** Temporary, opt-in fixture. No account, API, upload or server is involved. */
export default function VoiceQa() {
  const [sent, setSent] = useState<Attachment | null>(null);
  if (!Constants.expoConfig?.extra?.voiceFixture) return <Text>Unavailable</Text>;
  return <View style={{ flex: 1, padding: 16, backgroundColor: theme.background }}>
    <Text style={{ color: theme.text }}>In-process voice fixture · no server</Text>
    <VoiceRecorder disabled={false} preserveOnSend onSend={async (file, voice) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { requireOptionalNativeModule } = require('expo') as { requireOptionalNativeModule<T>(name: string): T | null };
      const native = requireOptionalNativeModule<{ isOgg(uri: string): Promise<boolean> }>('VoicsRecorder');
      if (!native || !await native.isOgg(file.uri) || !file.size) return false;
      type Cipher = {
        readAttachment(uri: string): Promise<string>;
        encryptAttachment(plain: string): Promise<{ ciphertext: string; key_b64: string; nonce_b64: string; sha256_b64: string }>;
        decryptAttachment(ciphertext: string, key: string, nonce: string, hash: string, size: number): Promise<string>;
      };
      const cipher = requireOptionalNativeModule<Cipher>(Platform.OS === 'ios' ? 'VoicsCrypto' : 'VoicsRecorder');
      if (!cipher?.readAttachment || !cipher.encryptAttachment || !cipher.decryptAttachment) return false;
      const known = await cipher.decryptAttachment('MW2/eLbIrWv4Mrrt2JEMGPGzw4ZlzZRmouTlgRT4u4UOJg==', 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=', 'AAECAwQFBgcICQoL', '1+vXh8wn6s9PYfBnx2jcSL8yMehzog2tvC7epCiRtYg=', 18);
      if (known !== 'dm9pY3Mtb3B1cy1maXh0dXJl') return false;
      const plain = await cipher.readAttachment(file.uri);
      const encrypted = await cipher.encryptAttachment(plain);
      if (await cipher.decryptAttachment(encrypted.ciphertext, encrypted.key_b64, encrypted.nonce_b64, encrypted.sha256_b64, file.size) !== plain) return false;
      const bytes = atob(encrypted.ciphertext);
      const tampered = btoa(String.fromCharCode(bytes.charCodeAt(0) ^ 1) + bytes.slice(1));
      let rejected = false;
      try { await cipher.decryptAttachment(tampered, encrypted.key_b64, encrypted.nonce_b64, encrypted.sha256_b64, file.size); } catch { rejected = true; }
      if (!rejected) return false;
      const body = voiceMessageBody('fixture', { id: 'fixture', filename: file.name, uploaded_filename: 'fixture/voice.ogg' }, voice);
      if (body.flags !== 8192 || body.attachments?.length !== 1) return false;
      setSent({ id: 'fixture', filename: file.name, content_type: file.mimeType, size: file.size, url: file.uri, ...voice });
      return true;
    }} />
    {sent && <><Text accessibilityRole="text" style={{ color: theme.text }}>Fixture sent · Ogg/Opus and native encryption verified</Text><AttachmentList attachments={[sent]} messageId="fixture" sending={false} /></>}
  </View>;
}
