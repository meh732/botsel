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
      // API Keys usually don't need discovery, but we check both /panel/api and /api in methods
      return { baseURL, headers: { 'Api-Key': apiKey, 'X-Api-Key': apiKey, 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json, text/plain, */*' } };
    }

    if (!this.cookie) {
      const loginPaths = ['/login', '/panel/login'];
      let loginSuccess = false;
      let lastLoginError = '';

      for (const loginPath of loginPaths) {
        try {
          console.log(`[X-UI Attempt] Login at: ${baseURL}${loginPath}`);
          
          // Try JSON
          let res = await this.client.post(`${baseURL}${loginPath}`, { username: panel.username, password: panel.password }, { headers: { 'Content-Type': 'application/json' }, validateStatus: () => true });
          
          // Try Form if JSON failed
          if (!res.data?.success) {
            const params = new URLSearchParams();
            params.append('username', panel.username || '');
            params.append('password', panel.password || '');
            res = await this.client.post(`${baseURL}${loginPath}`, params, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, validateStatus: () => true });
          }

          if (res.data?.success) {
            const cookiesHeader = res.headers['set-cookie'] || res.headers['Set-Cookie'];
            const cookies = Array.isArray(cookiesHeader) ? cookiesHeader : (cookiesHeader ? [cookiesHeader] : undefined);
            if (cookies && cookies.length > 0) {
              this.cookie = cookies.map(c => c.split(';')[0]).join('; ');
              loginSuccess = true;
              console.log(`[X-UI Success] Logged in via ${loginPath}`);
              break;
            }
          }
          lastLoginError = res.data?.msg || 'نام کاربری یا رمز عبور اشتباه است.';
        } catch (e: any) {
          lastLoginError = e.message;
        }
      }

      if (!loginSuccess) {
        throw new Error(lastLoginError || 'خطا در ورود به پنل سنایی. لطفا آدرس و مشخصات را بررسی کنید.');
      }
    }
    
    return {
      baseURL,
      headers: {
        'Cookie': this.cookie
      }
    };
  }

  public async testConnection() {
    try {
      const opts = await this.getAuthOptions();
      const paths = ['/panel/api/inbounds/list', '/api/inbounds/list'];
      
      let lastError = null;
      for (const path of paths) {
        try {
          console.log(`[X-UI Test] Probing: ${opts.baseURL}${path}`);
          const res = await this.client.get(`${opts.baseURL}${path}`, {
            headers: opts.headers,
            validateStatus: () => true
          });
          
          if (res.data?.success) {
            return { 
              success: true, 
              message: `اتصال برقرار شد. مسیر شناسایی شده: ${path}`,
              path: path
            };
          }
          lastError = res.data?.msg || 'پاسخ ناموفق';
        } catch (e: any) {
          lastError = e.message;
        }
      }
      
      return { success: false, message: `خطا در برقراری ارتباط: ${lastError}` };
    } catch (e: any) {
      console.error('[X-UI Test Error]:', e.message);
      return { success: false, message: e.message };
    }
  }

  public async getInbounds() {
    try {
      const state = db.getState();
      const panel = state.panel;
      if (!panel.url || (!panel.apiKey && (!panel.username || !panel.password))) {
        return [];
      }

      const opts = await this.getAuthOptions();
      const paths = ['/panel/api/inbounds/list', '/api/inbounds/list'];
      
      for (const path of paths) {
        try {
          const res = await this.client.get(`${opts.baseURL}${path}`, {
            headers: opts.headers,
            validateStatus: () => true
          });
          if (res.data?.success) {
            return res.data.obj || [];
          }
        } catch (e) {
          // Continue to next path
        }
      }
      return [];
    } catch (e: any) {
      console.error('[X-UI Error] Failed to get inbounds:', e?.message || e);
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
        totalGB: volumeGb,
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
        `${opts.baseURL}/api/inbounds/addclient`,
        `${opts.baseURL}/panel/api/inbounds/client/add`,
        `${opts.baseURL}/api/inbounds/client/add`,
        `${opts.baseURL}/panel/api/inbound/addClient`, // Some forks use singular
        `${opts.baseURL}/api/inbound/addClient`,
      ];

      let lastResponse: any = null;
      let lastError: any = null;
      let isSuccess = false;

      for (const url of possibleUrls) {
        try {
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
            isSuccess = true;
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
            isSuccess = true;
            lastResponse = res;
            break;
          }
        } catch (err: any) {
          lastError = err;
          console.error(`[X-UI Loop Error] URL ${url} failed:`, err.message);
        }
      }

      if (!isSuccess) {
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
