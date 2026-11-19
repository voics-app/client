import { useState } from 'react';
import { Text, View } from 'react-native';
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
      const body = voiceMessageBody('fixture', { id: 'fixture', filename: file.name, uploaded_filename: 'fixture/voice.ogg' }, voice);
      if (body.flags !== 8192 || body.attachments?.length !== 1) return false;
      setSent({ id: 'fixture', filename: file.name, content_type: file.mimeType, size: file.size, url: file.uri, ...voice });
      return true;
    }} />
    {sent && <><Text accessibilityRole="text" style={{ color: theme.text }}>Fixture sent · OggS verified</Text><AttachmentList attachments={[sent]} messageId="fixture" sending={false} /></>}
  </View>;
}
