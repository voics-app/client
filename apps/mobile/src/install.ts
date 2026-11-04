// Imported first by the root layout: persisted stores hydrate when they are first imported, so the brand and
// the device storage must be installed before any @discordy/core store loads.
import { installDeviceStorage } from '@discordy/core/application/ports/deviceStorage';
import kvStore from 'expo-sqlite/kv-store';
import { createKvStorage } from './adapters/kvStorage';
import './brand';

installDeviceStorage(createKvStorage(kvStore));
