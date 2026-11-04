import { installDeviceStorage } from '@discordy/core/application/ports/deviceStorage';
import { createBrowserStorage } from './browserStorage';

// Imported first by the renderer entry so every persisted store hydrates from localStorage.
installDeviceStorage(createBrowserStorage());
