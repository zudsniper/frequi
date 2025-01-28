import type { AxiosResponse } from 'axios';
import axios from 'axios';

import type {
  AuthPayload,
  AuthResponse,
  BotDescriptors,
  AuthStorage,
  AuthStorageMulti,
  BotDescriptor,
} from '@/types';

const AUTH_LOGIN_INFO = 'ftAuthLoginInfo';
const APIBASE = '/api/v1';

// Global state for all login infos
const allLoginInfos = useStorage<AuthStorageMulti>(AUTH_LOGIN_INFO, {});

/**
 * Get available bots with their descriptors
 */
export function getAvailableBots(): BotDescriptors {
  const allInfo = allLoginInfos.value;
  const response: BotDescriptors = {};
  Object.keys(allInfo)
    .sort((a, b) => (allInfo[a].sortId ?? 0) - (allInfo[b].sortId ?? 0))
    .forEach((k, idx) => {
      response[k] = {
        botId: k,
        botName: allInfo[k].botName,
        botUrl: allInfo[k].apiUrl,
        sortId: allInfo[k].sortId ?? idx,
      };
    });

  return response;
}

/**
 * Get list of available bot IDs
 */
export function getAvailableBotList(): string[] {
  return Object.keys(allLoginInfos.value);
}

export function useLoginInfo(botId: string) {
  console.log('botId', botId);

  const currentInfo = computed({
    get: () => allLoginInfos.value[botId],
    set: (val) => (allLoginInfos.value[botId] = val),
  });

  /**
   * Store login info for current botId in the object of all bots
   */
  function storeLoginInfo(loginInfo: AuthStorage): void {
    // allLoginInfos.value[botId] = loginInfo;
    currentInfo.value = loginInfo;
  }

  /**
   * Get login info for current bot
   */
  function getLoginInfo(): AuthStorage {
    if (
      botId in allLoginInfos.value &&
      'apiUrl' in allLoginInfos.value[botId] &&
      'refreshToken' in allLoginInfos.value[botId]
    ) {
      return allLoginInfos.value[botId];
    }
    return {
      botName: '',
      apiUrl: '',
      username: '',
      refreshToken: '',
      accessToken: '',
      autoRefresh: false,
    };
  }

  function updateBot(newValues: Partial<BotDescriptor>): void {
    Object.assign(currentInfo.value, newValues);
  }

  function setRefreshTokenExpired(): void {
    currentInfo.value.refreshToken = '';
    currentInfo.value.accessToken = '';
  }

  const autoRefresh = computed({
    get: () => currentInfo.value.autoRefresh,
    set: (val) => (currentInfo.value.autoRefresh = val),
  });
  const accessToken = computed(() => currentInfo.value.accessToken);
  const apiUrl = computed(() => currentInfo.value.apiUrl);

  function logout(): void {
    console.log('Logging out');
    delete allLoginInfos.value[botId];
  }

  async function loginCall(auth: AuthPayload): Promise<AuthStorage> {
    const { data } = await axios.post<Record<string, never>, AxiosResponse<AuthResponse>>(
      `${auth.url}/api/v1/token/login`,
      {},
      {
        auth: { ...auth },
      },
    );
    if (data.access_token && data.refresh_token) {
      const obj: AuthStorage = {
        botName: auth.botName,
        apiUrl: auth.url,
        username: auth.username,
        accessToken: data.access_token || '',
        refreshToken: data.refresh_token || '',
        autoRefresh: true,
      };
      return Promise.resolve(obj);
    }
    return Promise.reject('login failed');
  }

  async function login(auth: AuthPayload) {
    const obj = await loginCall(auth);
    storeLoginInfo(obj);
  }

  function refreshToken(): Promise<string> {
    console.log('Refreshing token...');
    const token = currentInfo.value.refreshToken;
    return new Promise((resolve, reject) => {
      axios
        .post<Record<string, never>, AxiosResponse<AuthResponse>>(
          `${apiUrl.value}${APIBASE}/token/refresh`,
          {},
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        )
        .then((response) => {
          if (response.data.access_token) {
            currentInfo.value.accessToken = response.data.access_token;
            resolve(response.data.access_token);
          }
        })
        .catch((err) => {
          console.error(err);
          if (err.response && err.response.status === 401) {
            console.log('Refresh token did not refresh.');
            setRefreshTokenExpired();
          } else if (err.response && (err.response.status === 500 || err.response.status === 404)) {
            console.log('Bot seems to be offline... - retrying later');
          }
          reject(err);
        });
    });
  }

  const baseUrl = computed<string>(() => {
    const baseURL = apiUrl.value;
    if (baseURL === null) {
      return APIBASE;
    }
    if (!baseURL.endsWith(APIBASE)) {
      return `${baseURL}${APIBASE}`;
    }
    return `${baseURL}${APIBASE}`;
  });

  const baseWsUrl = computed<string>(() => {
    const baseURL = baseUrl.value;
    if (baseURL.startsWith('http://')) {
      return baseURL.replace('http://', 'ws://');
    }
    if (baseURL.startsWith('https://')) {
      return baseURL.replace('https://', 'wss://');
    }
    return '';
  });

  return {
    updateBot,
    getLoginInfo,
    autoRefresh,
    accessToken,
    apiUrl,
    logout,
    login,
    refreshToken,
    baseUrl,
    baseWsUrl,
  };
}
