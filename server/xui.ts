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
    const baseURL = formattedUrl.endsWith('/') ? formattedUrl.slice(0, -1) : formattedUrl;

    if (panel.apiKey) {
      console.log(`[X-UI] Authenticating using API Key with baseURL: ${baseURL}`);
      return {
        baseURL,
        headers: {
          'Api-Key': panel.apiKey.trim(),
          'X-Api-Key': panel.apiKey.trim(),
          'Authorization': `Bearer ${panel.apiKey.trim()}`,
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
      const opts = await this.getAuthOptions();
      console.log(`[X-UI] Fetching inbounds from: ${opts.baseURL}/panel/api/inbounds/list`);
      const res = await this.client.get(`${opts.baseURL}/panel/api/inbounds/list`, {
        headers: opts.headers
      });
      console.log(`[X-UI] GetInbounds response status: ${res.status}, success: ${res.data?.success}`);
      if (res.data?.success) {
        return res.data.obj;
      }
      throw new Error(res.data?.msg || 'پنل لیست اینباندها را برنگرداند.');
    } catch (e: any) {
      console.error('[X-UI] Failed to get inbounds:', e?.message || e);
      if (e.response) {
        console.error('[X-UI] Response details:', e.response.status, JSON.stringify(e.response.data));
      }
      this.cookie = ''; // Reset cookie in case it was an expired session
      throw new Error(e?.message || 'خطا در لود لیست اینباندها. اتصال یا مشخصات ورود پنل را بررسی کنید.');
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

  public async addClient(email: string, volumeGb: number, durationDays: number, targetInboundId?: number) {
    const state = db.getState();
    const finalInboundId = targetInboundId || state.panel.inboundId;
    if (!finalInboundId) {
      throw new Error('هیچ شناسه اینباندی (Inbound ID) برای این محصول یا به صورت عمومی تعریف نشده است. لطفا در پنل مدیریت تنظیم کنید.');
    }

    try {
      const opts = await this.getAuthOptions();
      
      // Scan for any existing client with the same email across all inbounds, and delete to prevent duplicates
      try {
        const inboundsList = await this.getInbounds();
        if (inboundsList && Array.isArray(inboundsList)) {
          for (const inbound of inboundsList) {
            if (inbound.settings) {
              const parsedSettings = typeof inbound.settings === 'string' ? JSON.parse(inbound.settings) : inbound.settings;
              if (parsedSettings && parsedSettings.clients) {
                const found = parsedSettings.clients.find((c: any) => c.email === email);
                if (found) {
                  console.log(`[X-UI] Found existing client with email "${email}" (Id: ${found.id}) in inbound ${inbound.id}. Deleting to allow update/reinstall...`);
                  await this.delClient(inbound.id, found.id);
                }
              }
            }
          }
        }
      } catch (scanErr: any) {
        console.error('[X-UI Error] Error scanning/deleting duplicate clients, proceeding anyway:', scanErr.message);
      }

      // Calculate expiry time (epoch ms)
      const expiryTime = durationDays > 0 ? Date.now() + durationDays * 24 * 60 * 60 * 1000 : 0;
      // Calculate volume in bytes
      const totalGB = volumeGb > 0 ? volumeGb * 1024 * 1024 * 1024 : 0;
      
      const clientId = uuidv4(); // Generate UUID

      const settings = {
        clients: [
          {
            id: clientId,
            email: email,
            enable: true,
            expiryTime: expiryTime,
            totalGB: totalGB,
            tgId: "",
            subId: uuidv4().replace(/-/g, '').substring(0, 16) // Sub Id for subscription
          }
        ]
      };

      const res = await this.client.post(`${opts.baseURL}/panel/api/inbounds/addClient`, {
        id: finalInboundId,
        settings: JSON.stringify(settings)
      }, {
        headers: opts.headers
      });

      if (res.data?.success) {
        // Return subscription link format (standard 3x-ui sub link structure)
        const subPath = state.panel.url.endsWith('/') ? state.panel.url : state.panel.url + '/';
        return {
          uuid: clientId,
          email: email,
          subUrl: `${subPath}sub/${settings.clients[0].subId}`
        };
      } else {
        throw new Error(res.data?.msg || 'Panel returned unsuccessful response when adding client.');
      }
    } catch (e: any) {
      console.error('Failed to add client to XUI:', e?.message || e);
      this.cookie = '';
      throw new Error(e?.message || 'Could not add client. Check connection or inbound ID.');
    }
  }
}

export const xui = new XuiClient();
