#!/usr/bin/env node
/** Run after iOS prebuild to verify target embedding, source membership and matching app-group settings. */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import xcode from 'xcode';
import plistModule from '@expo/plist';

const plist = plistModule.default ?? plistModule;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../ios');
const projectName = readdirSync(root).find((file) => file.endsWith('.xcodeproj'));
assert(projectName, 'iOS prebuild must run first');
const project = xcode.project(path.join(root, projectName, 'project.pbxproj'));
project.parseSync();
const objects = project.hash.project.objects;
const targets = Object.values(objects.PBXNativeTarget).filter((value) => typeof value === 'object');
const extension = targets.filter((target) => target.name.replaceAll('"', '') === 'VoicsBroadcast');
assert.equal(extension.length, 1, 'exactly one broadcast target');
const files = objects.PBXBuildFile;
const embedded = Object.values(objects.PBXCopyFilesBuildPhase).filter((phase) => typeof phase === 'object')
  .flatMap((phase) => phase.files).some((file) => files[file.value]?.fileRef === extension[0].productReference);
assert(embedded, 'host app embeds the extension');
const sources = extension[0].buildPhases.flatMap((phase) => objects.PBXSourcesBuildPhase[phase.value]?.files ?? [])
  .map((file) => objects.PBXFileReference[files[file.value].fileRef].path.replaceAll('"', ''));
for (const file of ['SampleHandler.swift', 'FrameUploader.swift', 'BroadcastSignals.swift']) {
  assert(sources.includes(`VoicsBroadcast/${file}`), `extension compiles ${file}`);
}
const load = (relative) => plist.parse(readFileSync(path.join(root, relative), 'utf8'));
const hostName = projectName.replace('.xcodeproj', '');
const host = load(`${hostName}/Info.plist`);
const info = load('VoicsBroadcast/Info.plist');
const hostEntitlements = load(`${hostName}/${hostName}.entitlements`);
const extensionEntitlements = load('VoicsBroadcast/VoicsBroadcast.entitlements');
assert.equal(host.RTCAppGroupIdentifier, info.RTCAppGroupIdentifier);
assert.equal(host.RTCScreenSharingExtension, 'nl.voics.app.broadcast');
assert(hostEntitlements['com.apple.security.application-groups'].includes(info.RTCAppGroupIdentifier));
assert(extensionEntitlements['com.apple.security.application-groups'].includes(info.RTCAppGroupIdentifier));
assert.equal(info.NSExtension.NSExtensionPointIdentifier, 'com.apple.broadcast-services-upload');
assert.equal(info.NSExtension.RPBroadcastProcessMode, 'RPBroadcastProcessModeSampleBuffer');
assert.equal(host.CFBundleVersion, info.CFBundleVersion, 'host and extension build versions must match');
console.log('ReplayKit target, embedded product, Swift sources, entitlements and versions verified.');
