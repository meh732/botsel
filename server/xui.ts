import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { db } from './db.js';

class XuiClient {
  private client: AxiosInstance;
  private cookie: string = '';

  constructor() {
    this.client = axios.create({
      timeout: 10000,
    });
  }

  private async getAuthOptions() {
    const state = db.getState();
    const panel = state.panel;
    if (!panel.url || !panel.username || !panel.password) {
      throw new Error('Panel not configured properly');
    }
    
    // Create base URL without trailing slash
    const baseURL = panel.url.endsWith('/') ? panel.url.slice(0, -1) : panel.url;

    if (!this.cookie) {
      const res = await axios.post(`${baseURL}/login`, {
        username: panel.username,
        password: panel.password
      }, {
        validateStatus: () => true
      });
      
      if (res.data?.success) {
        const cookies = res.headers['set-cookie'];
        if (cookies && cookies.length > 0) {
          this.cookie = cookies[0].split(';')[0];
        }
      } else {
        throw new Error('Panel login failed');
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
      const res = await axios.get(`${opts.baseURL}/panel/api/inbounds/list`, {
        headers: opts.headers
      });
      if (res.data?.success) {
        return res.data.obj;
      }
      return [];
    } catch (e: any) {
      console.error('Failed to get inbounds', e?.message);
      this.cookie = ''; // reset cookie
      throw e;
    }
  }

  public async addClient(email: string, volumeGb: number, durationDays: number) {
    const state = db.getState();
    if (!state.panel.inboundId) {
      throw new Error('No inbound ID configured in Admin Panel');
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
            subId: uuidv4().replace(/-/g, '').substring(0, 16) // usually subId
          }
        ]
      };

      const res = await axios.post(`${opts.baseURL}/panel/api/inbounds/addClient`, {
        id: state.panel.inboundId,
        settings: JSON.stringify(settings)
      }, {
        headers: opts.headers
      });

      if (res.data?.success) {
        // Return subscription link format (simple X-Ray config needs sub link)
        // Usually Sanaei provides a sub link endpoint. 
        const subPath = state.panel.url.endsWith('/') ? state.panel.url : state.panel.url + '/';
        return {
          uuid: clientId,
          email: email,
          subUrl: `${subPath}sub/${settings.clients[0].subId}`
        };
      } else {
        throw new Error(res.data?.msg || 'Failed to add client');
      }
    } catch (e: any) {
      console.error('Failed to add client to XUI', e?.message);
      this.cookie = '';
      throw e;
    }
  }
}

export const xui = new XuiClient();
