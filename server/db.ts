import fs from 'fs';
import path from 'path';

export interface PanelConfig {
  url?: string;
  username?: string;
  password?: string;
  inboundId?: number;
}

export interface Product {
  id: string;
  name: string;
  price: number; // in Toman
  volumeGb: number; // Gigabytes
  durationDays: number;
}

export interface User {
  chatId: number;
  username?: string;
  balance: number;
  testUsed: boolean;
  registeredAt: string;
  referredBy?: number;
  referralsMade?: number;
  isSeller?: boolean;
  debt?: number;
  totalSales?: number;
}

export interface AppState {
  botToken?: string;
  panel: PanelConfig;
  products: Product[];
  users: User[];
  freeTestVolumeGb: number;
  freeTestDurationDays: number;
  adminIds: number[];
  referralRewardToman: number;
}

const DB_PATH = path.join(process.cwd(), 'db.json');

const defaultState: AppState = {
  botToken: '',
  panel: {},
  products: [],
  users: [],
  freeTestVolumeGb: 1,
  freeTestDurationDays: 3,
  adminIds: [],
  referralRewardToman: 0
};

class Database {
  private state: AppState;

  constructor() {
    this.state = { ...defaultState };
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(DB_PATH)) {
        const data = fs.readFileSync(DB_PATH, 'utf-8');
        const parsed = JSON.parse(data);
        this.state = { ...defaultState, ...parsed };
      } else {
        this.save();
      }
    } catch (e) {
      console.error('Failed to load db.json', e);
    }
  }

  private save() {
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(this.state, null, 2));
    } catch (e) {
      console.error('Failed to save db.json', e);
    }
  }

  public getState() {
    return this.state;
  }

  public updateState(partial: Partial<AppState>) {
    this.state = { ...this.state, ...partial };
    this.save();
  }

  public saveUser(user: User) {
    const idx = this.state.users.findIndex(u => u.chatId === user.chatId);
    if (idx >= 0) {
      this.state.users[idx] = user;
    } else {
      this.state.users.push(user);
    }
    this.save();
  }

  public getUser(chatId: number): User | undefined {
    return this.state.users.find(u => u.chatId === chatId);
  }
}

export const db = new Database();
