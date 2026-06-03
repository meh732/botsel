import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { v4 as uuidv4 } from 'uuid';
import { db } from './db.js';

class XuiClient {
  private client: AxiosInstance;
  private cookie: string = '';

  constructor() {
    this.client = axios.create({
      timeout: 15000,
      httpsAgent: new https.Agent({ rejectUnauthorized: false }), // Ignore self-signed certificates
    });
  }

  private async getAuthOptions() {
    const state = db.getState();
    const panel = state.panel;
    if (!panel.url || !panel.username || !panel.password) {
      throw new Error('مشخصات پنل متصل نشده است. لطفا آدرس، نام کاربری و رمز ورود را در بخش تنظیمات وارد نمایید.');
    }
    
    // Create base URL without trailing slash
    const baseURL = panel.url.endsWith('/') ? panel.url.slice(0, -1) : panel.url;

    if (!this.cookie) {
      console.log(`[X-UI] Connection attempt to: ${baseURL}/login using username: ${panel.username}`);
      
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
        console.log(`[X-UI] JSON login response status: ${res.status}, success: ${res.data?.success}, body:`, JSON.stringify(res.data));
      } catch (jsonErr: any) {
        console.error(`[X-UI] JSON login threw exception: ${jsonErr.message}`);
      }
      
      // Fallback: Try URL-encoded post (required by some MHSanaei/franz versions)
      if (!res || !res.data?.success) {
        console.log(`[X-UI] JSON login failed, trying Form URL-encoded fallback login...`);
        try {
          const params = new URLSearchParams();
          params.append('username', panel.username);
          params.append('password', panel.password);
          
          const resForm = await this.client.post(`${baseURL}/login`, params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            validateStatus: () => true
          });
          console.log(`[X-UI] Form login response status: ${resForm.status}, success: ${resForm.data?.success}, body:`, JSON.stringify(resForm.data));
          if (resForm.data?.success) {
            res = resForm;
          }
        } catch (formErr: any) {
          console.error(`[X-UI] Form/fallback login threw exception: ${formErr.message}`);
        }
      }
      
      if (res && res.data?.success) {
        const cookies = res.headers['set-cookie'];
        if (cookies && cookies.length > 0) {
          // Join all cookies (session, lang, etc.) instead of just the first one
          this.cookie = cookies.map(c => c.split(';')[0]).join('; ');
          console.log('[X-UI] Logged in successfully. Saved Session Cookies:', this.cookie);
        } else {
          throw new Error('پنل جواب مثبت داد اما کوکی دریافت نشد. لطفا پسوند آدرس پنل (basePath) را چک کنید.');
        }
      } else {
        const errorMsg = res?.data?.msg || 'نام کاربری یا رمز عبور پنل سنایی اشتباه است.';
        throw new Error(errorMsg);
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

  public async addClient(email: string, volumeGb: number, durationDays: number, targetInboundId?: number) {
    const state = db.getState();
    const finalInboundId = targetInboundId || state.panel.inboundId;
    if (!finalInboundId) {
      throw new Error('هیچ شناسه اینباندی (Inbound ID) برای این محصول یا به صورت عمومی تعریف نشده است. لطفا در پنل مدیریت تنظیم کنید.');
    }

    try {
      const opts = await this.getAuthOptions();
      
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
