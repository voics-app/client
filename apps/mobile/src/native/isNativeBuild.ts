import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * True in a development or preview build (EAS), false in Expo Go. Native modules that Expo Go does not
 * contain (WebRTC, call audio) are only loaded when this is true, so the app still starts in Expo Go.
 */
export const isNativeBuild = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
