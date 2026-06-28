import * as Crypto from 'expo-crypto';
import {
  GoogleOneTapSignIn,
  isCancelledResponse,
  isNoSavedCredentialFoundResponse,
} from 'react-native-nitro-google-signin';
import { supabase } from './supabase';

const webClientId = (process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '').trim();

export async function signInWithGoogle(): Promise<string | null> {
  if (!supabase) throw new Error('Supabase is not configured');
  if (!webClientId) throw new Error('Missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID');

  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
    { encoding: Crypto.CryptoEncoding.HEX }
  );

  // hashed nonce → google; raw → supabase
  GoogleOneTapSignIn.configure({ webClientId, nonce: hashedNonce });
  await GoogleOneTapSignIn.checkPlayServices();

  let response = await GoogleOneTapSignIn.signIn();
  if (isNoSavedCredentialFoundResponse(response)) {
    // no authorized account → full chooser
    response = await GoogleOneTapSignIn.presentExplicitSignIn();
  }
  if (isCancelledResponse(response)) return null;

  const credential = response.data;
  if (!credential) throw new Error('Google sign-in returned no credential');

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: credential.idToken,
    nonce: rawNonce,
  });
  if (error) throw error;

  const userId = data.user?.id;
  if (!userId) throw new Error('Google sign-in returned no user');
  return userId;
}
