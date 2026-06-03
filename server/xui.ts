import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { v4 as uuidv4 } from 'uuid';
import { db } from './db.js';

class XuiClient {
  private client: AxiosInstance;
  private cookie: string = '';

  constructor() {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    this.client = axios.create({
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      },
      httpsAgent: new https.Agent({ 
        rejectUnauthorized: false,
        keepAlive: true
      }), // Ignore self-signed certificates
    });
  }

  private async getAuthOptions() {
    const state = db.getState();
    const panel = state.panel;
    if (!panel.url || (!panel.apiKey && (!panel.username || !panel.password))) {
      throw new Error('مشخصات پنل متصل نشده است. لطفا آدرس، یا کلید API یا نام کاربری و رمز ورود را در بخش تنظیمات وارد نمایید.');
    }
    
    // Auto-prepend http:// if no protocol is defined
    let formattedUrl = panel.url.trim().replace(/\s/g, '');
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = 'http://' + formattedUrl;
    }
    
    // Create base URL without trailing slash
    let baseURL = formattedUrl.endsWith('/') ? formattedUrl.slice(0, -1) : formattedUrl;
    
    // Auto-fix common mistake: user entering URL with /panel at the end
    if (baseURL.toLowerCase().endsWith('/panel')) {
      console.log(`[X-UI] Normalizing URL: removed trailing /panel from ${baseURL}`);
      baseURL = baseURL.slice(0, -6);
    }

    if (panel.apiKey) {
      const apiKey = panel.apiKey.trim();
      console.log(`[X-UI] Authenticating using API Key with baseURL: ${baseURL}`);
      return {
        baseURL,
        headers: {
          'Api-Key': apiKey,
          'X-Api-Key': apiKey,
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json, text/plain, */*'
        }
      };
    }

    if (!this.cookie) {
      console.log(`[X-UI] Connection attempt to: ${baseURL}/login using username: ${panel.username}`);
      
      let lastErrorMsg = '';
      let res;
      try {
        // Try JSON login post first
        res = await this.client.post(`${baseURL}/login`, {
          username: panel.username,
          password: panel.password
        }, {
          headers: { 'Content-Type': 'application/json' },
          validateStatus: () => true
        });
        console.log(`[X-UI] JSON login response status: ${res.status}, success: ${res.data?.success}`, JSON.stringify(res.data));
        if (!res.data?.success) {
          lastErrorMsg = res.data?.msg || 'اطلاعات کاربری اشتباه است.';
        }
      } catch (jsonErr: any) {
        console.error(`[X-UI] JSON login threw exception: ${jsonErr.message}`);
        lastErrorMsg = `خطای اتصال شبکه: ${jsonErr.message}`;
      }
      
      // Fallback: Try URL-encoded post (required by some MHSanaei/franz versions)
      if (!res || !res.data?.success) {
        console.log(`[X-UI] JSON login failed or unreachable, trying Form URL-encoded fallback login...`);
        try {
          const params = new URLSearchParams();
          params.append('username', panel.username || '');
          params.append('password', panel.password || '');
          
          const resForm = await this.client.post(`${baseURL}/login`, params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            validateStatus: () => true
          });
          console.log(`[X-UI] Form login response status: ${resForm.status}, success: ${resForm.data?.success}`, JSON.stringify(resForm.data));
          if (resForm.data?.success) {
            res = resForm;
            lastErrorMsg = ''; // Reset on success
          } else {
            lastErrorMsg = resForm.data?.msg || lastErrorMsg || 'نام کاربری یا رمز عبور اشتباه است.';
          }
        } catch (formErr: any) {
          console.error(`[X-UI] Form/fallback login threw exception: ${formErr.message}`);
          lastErrorMsg = lastErrorMsg || `خطای اتصال شبکه (فرم): ${formErr.message}`;
        }
      }
      
      if (res && res.data?.success) {
        const cookiesHeader = res.headers['set-cookie'] || res.headers['Set-Cookie'] || res.headers['SET-COOKIE'];
        const cookies = Array.isArray(cookiesHeader) ? cookiesHeader : (cookiesHeader ? [cookiesHeader] : undefined);
        if (cookies && cookies.length > 0) {
          this.cookie = cookies.map(c => c.split(';')[0]).join('; ');
          console.log('[X-UI] Logged in successfully. Saved Session Cookies:', this.cookie);
        } else {
          // If we logged in successfully but set-cookie was empty, check keys case-insensitively
          const keys = Object.keys(res.headers);
          const cookieKey = keys.find(k => k.toLowerCase() === 'set-cookie');
          const fallbackCookies = cookieKey ? res.headers[cookieKey] : undefined;
          const finalCookies = Array.isArray(fallbackCookies) ? fallbackCookies : (fallbackCookies ? [fallbackCookies] : undefined);
          if (finalCookies && finalCookies.length > 0) {
            this.cookie = finalCookies.map(c => c.split(';')[0]).join('; ');
            console.log('[X-UI] Logged in with case-insensitive cookies:', this.cookie);
          } else {
            console.warn('[X-UI] Login success but Cookie header empty. Proceeding with empty session cookie.');
          }
        }
      } else {
        throw new Error(lastErrorMsg || 'خطا در ورود به پنل سنایی. لطفا آدرس، پورت و فایروال را بررسی کنید.');
      }
    }
    
    return {
      baseURL,
      headers: {
        'Cookie': this.cookie
      }
    };
  }

  public async getInbounds() {
    try {
      const state = db.getState();
      const panel = state.panel;
      if (!panel.url || (!panel.apiKey && (!panel.username || !panel.password))) {
        console.warn('[X-UI] Panel not configured yet, returning empty inbounds list.');
        return [];
      }

      const opts = await this.getAuthOptions();
      console.log(`[X-UI] Fetching inbounds from: ${opts.baseURL}/panel/api/inbounds/list`);
      const res = await this.client.get(`${opts.baseURL}/panel/api/inbounds/list`, {
        headers: opts.headers
      });
      console.log(`[X-UI] GetInbounds response status: ${res.status}, success: ${res.data?.success}`);
      if (res.data?.success) {
        return res.data.obj || [];
      }
      return [];
    } catch (e: any) {
      console.error('[X-UI Error] Failed to get inbounds:', e?.message || e);
      if (e.response) {
        console.error('[X-UI Error Detail] Status:', e.response.status, 'Data:', JSON.stringify(e.response.data));
      }
      this.cookie = ''; 
      return [];
    }
  }

  public async delClient(inboundId: number, clientUuid: string) {
    try {
      const opts = await this.getAuthOptions();
      console.log(`[X-UI] Deleting client ${clientUuid} from inbound ${inboundId}`);
      
      // Try MHSanaei/franz standard format: /panel/api/inbounds/delClient/{clientUuid}
      let res = await this.client.post(`${opts.baseURL}/panel/api/inbounds/delClient/${clientUuid}`, {}, {
        headers: opts.headers,
        validateStatus: () => true
      });
      
      // Fallback: Try /panel/api/inbounds/{inboundId}/delClient/{clientUuid}
      if (!res.data || !res.data.success) {
        res = await this.client.post(`${opts.baseURL}/panel/api/inbounds/delClient/${inboundId}/${clientUuid}`, {}, {
          headers: opts.headers,
          validateStatus: () => true
        });
      }
      
      console.log(`[X-UI] delClient response:`, JSON.stringify(res.data));
      return res.data?.success || false;
    } catch (e: any) {
      console.error('[X-UI] Failed to delete client:', e.message);
      return false;
    }
  }

  public async addClient(email: string, volumeGb: number, durationDays: number, targetInboundIds?: number | number[], limitIp: number = 0, telegramId?: string) {
    const state = db.getState();
    let finalInboundIds: number[] = [];

    if (Array.isArray(targetInboundIds) && targetInboundIds.length > 0) {
      finalInboundIds = targetInboundIds;
      console.log(`[X-UI] Target Inbound IDs: ${JSON.stringify(finalInboundIds)}`);
    } else if (typeof targetInboundIds === 'number' && !isNaN(targetInboundIds)) {
      finalInboundIds = [targetInboundIds];
    } else if (typeof targetInboundIds === 'string' && targetInboundIds) {
      const parsed = parseInt(targetInboundIds);
      if (!isNaN(parsed)) finalInboundIds = [parsed];
    }

    if (finalInboundIds.length === 0) {
      if (state.panel.inboundIds && state.panel.inboundIds.length > 0) {
        finalInboundIds = state.panel.inboundIds.map(id => Number(id)).filter(id => !isNaN(id));
      } else if (state.panel.inboundId) {
        const id = Number(state.panel.inboundId);
        if (!isNaN(id)) finalInboundIds = [id];
      }
    }

    if (finalInboundIds.length === 0) {
      throw new Error('هیچ شناسه اینباندی (Inbound ID) تعریف نشده است. لطفا در لیست محصولات یا تنظیمات پنل چک کنید.');
    }

    const primaryInboundId = Number(finalInboundIds[0]);
    if (isNaN(primaryInboundId)) {
        throw new Error('شناسه اینباند (Inbound ID) نامعتبر است. باید یک عدد باشد.');
    }

    try {
      const opts = await this.getAuthOptions();
      
      // Fetch inbounds once for tags and duplicate scanning
      const inboundsList: any[] = await this.getInbounds() || [];

      // 1. Scan and delete existing client with the same email in ALL discovered inbounds to prevent duplication
      if (inboundsList && inboundsList.length > 0) {
        try {
          for (const inbound of inboundsList) {
            if (inbound.settings) {
              const parsedSettings = typeof inbound.settings === 'string' ? JSON.parse(inbound.settings) : inbound.settings;
              if (parsedSettings && parsedSettings.clients) {
                const found = parsedSettings.clients.find((c: any) => c.email === email);
                if (found) {
                  console.log(`[X-UI] Found existing client "${email}" in inbound ${inbound.id}. Deleting...`);
                  await this.delClient(inbound.id, found.id || found.password);
                }
              }
            }
          }
        } catch (scanErr: any) {
          console.error('[X-UI Error] Error scanning duplicates:', scanErr.message);
        }
      }

      // Calculate common properties
      const expiryTime = durationDays > 0 ? Date.now() + durationDays * 24 * 60 * 60 * 1000 : 0;
      const totalBytes = volumeGb > 0 ? Math.floor(volumeGb * 1024 * 1024 * 1024) : 0;
      const clientId = uuidv4();
      const subId = uuidv4().replace(/-/g, '').substring(0, 16);

      // Multi-Inbound Tags Support (for newer MHSanaei 3x-ui versions)
      const primaryInboundId = finalInboundIds[0];
      const otherTags: string[] = [];
      if (finalInboundIds.length > 1 && inboundsList.length > 0) {
        finalInboundIds.slice(1).forEach(id => {
          const found = inboundsList.find(ib => Number(ib.id) === Number(id));
          if (found && found.remark) {
            otherTags.push(found.remark);
          }
        });
      }

      const clientObj: any = {
        id: clientId,
        password: clientId,
        email: email,
        enable: true,
        expiryTime: expiryTime,
        total: totalBytes,
        totalGB: totalBytes,
        limitIp: Number(limitIp) || 0,
        flow: "",
        tgId: telegramId || "",
        subId: subId
      };

      // Add "Attached inbounds" tags using specifically 'inboundTags' field
      if (otherTags.length > 0) {
        console.log(`[X-UI Debug] Attaching extra inbounds by tags: ${JSON.stringify(otherTags)}`);
        clientObj.inboundTags = otherTags;
      }

      const settings = {
        clients: [clientObj]
      };

      console.log(`[X-UI Debug] Final Primary Inbound ID: ${primaryInboundId}`);
      console.log(`[X-UI Debug] Payload being sent:`, JSON.stringify(settings));
      
      const possibleUrls = [
        `${opts.baseURL}/panel/api/inbounds/addClient`,
        `${opts.baseURL}/panel/api/inbounds/addclient`,
        `${opts.baseURL}/api/inbounds/addClient`,
        `${opts.baseURL}/panel/api/inbounds/client/add`,
      ];

      let lastError: any = null;
      for (const url of possibleUrls) {
        try {
          usedUrl = url;
          console.log(`[X-UI Attempt] Sending POST to: ${url} with Inbound ID: ${primaryInboundId}`);
          
          let res = await this.client.post(url, {
            id: Number(primaryInboundId),
            settings: JSON.stringify(settings)
          }, {
            headers: { ...opts.headers, 'Content-Type': 'application/json' },
            validateStatus: () => true
          });
          
          lastResponse = res;
          console.log(`[X-UI Response] URL: ${url} | Status: ${res?.status} | Data:`, JSON.stringify(res?.data));

          if (res?.data?.success) {
            success = true;
            break;
          }

          // Fallback: Try with settings as an object (not stringified)
          console.log(`[X-UI Info] Trying with object settings fallback...`);
          res = await this.client.post(url, {
            id: Number(primaryInboundId),
            settings: settings
          }, {
            headers: { ...opts.headers, 'Content-Type': 'application/json' },
            validateStatus: () => true
          });
          if (res?.data?.success) {
            success = true;
            break;
          }
        } catch (err: any) {
          lastError = err;
          console.error(`[X-UI Loop Error] URL ${url} failed:`, err.message);
        }
      }

      if (!success) {
        let errorMsg = lastResponse?.data?.msg || lastError?.message || 'پنل پاسخ ناموفق در ثبت مشتری بازگرداند.';
        if (lastResponse?.status === 404) errorMsg = 'آدرس API پنل پیدا نشد (404). لطفا آدرس پنل را چک کنید.';
        if (lastResponse?.status === 401 || lastResponse?.status === 403) errorMsg = 'خطای دسترسی (401/403). کلید API یا نام کاربری اشتباه است.';
        
        console.error(`[X-UI Fatal] All URLs failed. Msg: ${errorMsg}`);
        throw new Error(errorMsg);
      }

      const subPath = state.panel.url.endsWith('/') ? state.panel.url : state.panel.url + '/';
      return {
        uuid: clientId,
        email: email,
        subUrl: `${subPath}sub/${subId}`
      };
    } catch (e: any) {
      console.error('XUI AddClient Final Error:', e.message);
      this.cookie = '';
      throw e;
    }
  }
}

export const xui = new XuiClient();
