import { google } from 'googleapis';
import { readJson, writeJson } from './fileStore.js';
import { GMAIL_TOKENS_FILE } from './paths.js';

const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

function requireGoogleOAuthEnv() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    `http://localhost:${process.env.PORT || 4000}/api/gmail/oauth2callback`;

  if (!clientId || !clientSecret) {
    throw new Error(
      'חסרים משתני סביבה של Google OAuth: GOOGLE_CLIENT_ID ו-GOOGLE_CLIENT_SECRET',
    );
  }

  return { clientId, clientSecret, redirectUri };
}

export function createGoogleOAuthClient() {
  const { clientId, clientSecret, redirectUri } = requireGoogleOAuthEnv();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getGmailAuthUrl() {
  const oauthClient = createGoogleOAuthClient();

  return oauthClient.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GMAIL_SCOPES,
  });
}

export async function saveGmailTokensFromCode(code) {
  const oauthClient = createGoogleOAuthClient();
  const { tokens } = await oauthClient.getToken(code);

  await writeJson(GMAIL_TOKENS_FILE, {
    tokens,
    savedAt: new Date().toISOString(),
    scope: GMAIL_SCOPES,
  });

  return tokens;
}

export async function getAuthorizedGmailClient() {
  const saved = await readJson(GMAIL_TOKENS_FILE, null);

  if (!saved?.tokens) {
    return null;
  }

  const oauthClient = createGoogleOAuthClient();
  oauthClient.setCredentials(saved.tokens);

  oauthClient.on('tokens', async (tokens) => {
    const current = await readJson(GMAIL_TOKENS_FILE, saved);
    await writeJson(GMAIL_TOKENS_FILE, {
      ...current,
      tokens: {
        ...(current?.tokens || {}),
        ...tokens,
      },
      refreshedAt: new Date().toISOString(),
      scope: GMAIL_SCOPES,
    });
  });

  return google.gmail({ version: 'v1', auth: oauthClient });
}

export async function getGmailConnectionStatus() {
  const saved = await readJson(GMAIL_TOKENS_FILE, null);

  return {
    connected: Boolean(saved?.tokens?.refresh_token || saved?.tokens?.access_token),
    savedAt: saved?.savedAt || null,
    refreshedAt: saved?.refreshedAt || null,
    scope: saved?.scope || GMAIL_SCOPES,
  };
}
