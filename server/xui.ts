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

  private async getAuthOptions(panelOverride?: any) {
    const state = db.getState();
    const panel = panelOverride || state.panel;
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
    
    // Auto-fix common mistakes: user entering URL with /panel or /api at the end
    const commonSuffixes = ['/panel', '/api', '/panel/api'];
    for (const suffix of commonSuffixes) {
        if (baseURL.toLowerCase().endsWith(suffix)) {
            console.log(`[X-UI] Normalizing URL: removed trailing ${suffix} from ${baseURL}`);
            baseURL = baseURL.slice(0, -suffix.length);
        }
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
          'Accept': 'application/json' 
        } 
      };
    }

    if (!this.cookie) {
      console.log(`[X-UI] No session. Trying login at: ${baseURL}`);
      const loginPaths = ['/login', '/panel/login'];
      let loginSuccess = false;
      let lastLoginError = '';

      for (const loginPath of loginPaths) {
        try {
          console.log(`[X-UI Attempt] Login probe: ${baseURL}${loginPath}`);
          
          // Try JSON
          let res = await this.client.post(`${baseURL}${loginPath}`, { 
            username: panel.username, 
            password: panel.password 
          }, { 
            headers: { 'Content-Type': 'application/json' }, 
            validateStatus: () => true 
          });
          
          // Try Form if JSON failed
          if (!res.data?.success) {
            const params = new URLSearchParams();
            params.append('username', panel.username || '');
            params.append('password', panel.password || '');
            res = await this.client.post(`${baseURL}${loginPath}`, params, { 
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, 
              validateStatus: () => true 
            });
          }

          if (res.data?.success) {
            const cookiesHeader = res.headers['set-cookie'] || res.headers['Set-Cookie'];
            if (cookiesHeader) {
                const cookies = Array.isArray(cookiesHeader) ? cookiesHeader : [cookiesHeader];
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
        throw new Error(lastLoginError || 'خطا در ورود به پنل. لطفا آدرس و مشخصات را بررسی کنید.');
      }
    }
    
    return {
      baseURL,
      headers: {
        'Cookie': this.cookie,
        'Accept': 'application/json, text/plain, */*'
      }
    };
  }

  public async testConnection(panelOverride?: any) {
    try {
      const opts = await this.getAuthOptions(panelOverride);
      const paths = [
        '/panel/api/inbounds/list',
        '/api/inbounds/list',
        '/xui/api/inbounds/list',
        '/panel/inbounds/list'
      ];
      
      let lastError = null;
      for (const path of paths) {
        try {
          console.log(`[X-UI Test] Probing: ${opts.baseURL}${path}`);
          const res = await this.client.get(`${opts.baseURL}${path}`, {
            headers: opts.headers,
            validateStatus: () => true,
            timeout: 5000
          });
          
          if (res.data?.success || (res.status === 200 && Array.isArray(res.data?.obj))) {
            return { 
              success: true, 
              message: `اتصال برقرار شد. مسیر معتبر: ${path}`,
              path: path
            };
          }
          lastError = res.data?.msg || `وضعیت ${res.status}`;
        } catch (e: any) {
          lastError = e.message;
        }
      }
      
      return { success: false, message: `پنل در این آدرس شناسایی نشد. آخرین خطا: ${lastError}` };
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
      const paths = [
        '/panel/api/inbounds/list',
        '/api/inbounds/list',
        '/xui/api/inbounds/list',
        '/panel/inbounds/list'
      ];
      
      for (const path of paths) {
        try {
          const res = await this.client.get(`${opts.baseURL}${path}`, {
            headers: opts.headers,
            validateStatus: () => true
          });
          if (res.data?.success || (res.status === 200 && Array.isArray(res.data?.obj))) {
            return res.data.obj || [];
          }
        } catch (e) {
          // Continue
        }
      }
      return [];
    } catch (e: any) {
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
        `${opts.baseURL}/panel/api/inbound/addClient`,
        `${opts.baseURL}/api/inbound/addClient`,
        `${opts.baseURL}/panel/inbounds/addclient`,
        `${opts.baseURL}/panel/inbound/addclient`,
        `${opts.baseURL}/api/inbound/addclient`,
        `${opts.baseURL}/api/inbounds/client/add`,
      ];

      let lastResponse: any = null;
      let lastError: any = null;
      let isSuccess = false;

      for (const url of possibleUrls) {
        try {
          console.log(`[X-UI Attempt] Account creation probe: ${url} | Inbound ID: ${primaryInboundId}`);
          
          let res = await this.client.post(url, {
            id: Number(primaryInboundId),
            settings: JSON.stringify(settings)
          }, {
            headers: { ...opts.headers, 'Content-Type': 'application/json' },
            validateStatus: () => true,
            timeout: 10000
          });
          
          lastResponse = res;
          if (res?.data?.success) {
            isSuccess = true;
            console.log(`[X-UI Success] Created client via: ${url}`);
            break;
          }

          // Fallback: settings as object
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
            console.log(`[X-UI Success] Created client via: ${url} (Object Mode)`);
            break;
          }
        } catch (err: any) {
          lastError = err;
        }
      }

      if (!isSuccess) {
        let errorMsg = lastResponse?.data?.msg || lastError?.message || 'پنل پاسخ ناموفق در ثبت مشتری بازگرداند.';
        if (lastResponse?.status === 404) errorMsg = 'آدرس API پنل پیدا نشد (404). لطفا آدرس پنل یا Web Base Path را چک کنید.';
        if (lastResponse?.status === 401 || lastResponse?.status === 403) errorMsg = 'خطای دسترسی (401/403). کلید API یا نام کاربری اشتباه است.';
        throw new Error(errorMsg);
      }

      const domain = new URL(state.panel.url).hostname;
      const subPath = state.panel.url.endsWith('/') ? state.panel.url : state.panel.url + '/';
      const subUrlStr = `${subPath}sub/${subId}`;

      return {
        uuid: clientId,
        email: email,
        subUrl: subUrlStr,
        vlessUrl: `vless://${clientId}@${domain}:443?type=grpc&serviceName=grpc&security=tls&sni=${domain}#${email}`,
      };
    } catch (e: any) {
      console.error('XUI AddClient Final Error:', e.message);
      this.cookie = '';
      throw e;
    }
  }
}

export const xui = new XuiClient();
