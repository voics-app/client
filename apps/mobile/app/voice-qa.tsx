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
      type Mls = {
        isAvailable?(): boolean;
        initialise(userId: string, label: string): Promise<string>;
        generateKeyPackages(count: number): Promise<string[]>;
        createGroup(id: string): Promise<number>;
        addMembers(id: string, packages: string[]): Promise<{ welcomeB64: string }>;
        joinFromWelcome(welcome: string): Promise<unknown>;
        encrypt(id: string, payload: string): Promise<{ ciphertextB64: string }>;
        processIncoming(id: string, ciphertext: string): Promise<{ kind: string; plaintextB64?: string }>;
      };
      const mls = requireOptionalNativeModule<Mls>('VoicsCrypto');
      if (!mls?.initialise || (mls.isAvailable && !mls.isAvailable())) return false;
      const group = `voice-qa-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
      await mls.initialise('987650002', 'voice QA B');
      const packages = await mls.generateKeyPackages(1);
      if (packages.length !== 1) return false;
      await mls.initialise('987650001', 'voice QA A');
      await mls.createGroup(group);
      const welcome = await mls.addMembers(group, packages);
      await mls.initialise('987650002', 'voice QA B');
      await mls.joinFromWelcome(welcome.welcomeB64);
      const payload = btoa(JSON.stringify({ key: encrypted.key_b64, nonce: encrypted.nonce_b64, hash: encrypted.sha256_b64, voice }));
      await mls.initialise('987650001', 'voice QA A');
      const envelope = await mls.encrypt(group, payload);
      await mls.initialise('987650002', 'voice QA B');
      const incoming = await mls.processIncoming(group, envelope.ciphertextB64);
      if (incoming.kind !== 'application' || incoming.plaintextB64 !== payload) return false;
      const body = voiceMessageBody('fixture', { id: 'fixture', filename: file.name, uploaded_filename: 'fixture/voice.ogg' }, voice);
      if (body.flags !== 8192 || body.attachments?.length !== 1) return false;
      setSent({ id: 'fixture', filename: file.name, content_type: file.mimeType, size: file.size, url: file.uri, ...voice });
      return true;
    }} />
    {sent && <><Text accessibilityRole="text" style={{ color: theme.text }}>Fixture sent · Ogg/Opus, native encryption and MLS round-trip verified</Text><AttachmentList attachments={[sent]} messageId="fixture" sending={false} /></>}
  </View>;
}
